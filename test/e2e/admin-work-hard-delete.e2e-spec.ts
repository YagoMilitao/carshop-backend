import request from 'supertest';
import { createApp } from '../../src/infra/server';
import {
  connectDatabase,
  disconnectDatabase,
} from '../../src/infra/database/mongoose';
import { FakeImageStorageAdapter } from './support/fake-image-storage.adapter';
import { VALID_JPEG_BUFFER } from './support/valid-image-fixtures';

interface AuthResponseBody {
  accessToken: string;
  sessionId: string;
  tokenType: 'Bearer';
}

interface WorkResponseBody {
  id: string;
  slug: string;
  title: string;
  status: 'draft' | 'published';
  images: Array<{ id: string; publicId: string }>;
}

async function loginAsAdmin(
  app: ReturnType<typeof createApp>,
): Promise<string> {
  const loginResponse = await request(app)
    .post('/auth/login')
    .send({ email: 'admin@carshop.com', password: '123456' })
    .expect(200);
  const loginBody = loginResponse.body as AuthResponseBody;

  return loginBody.accessToken;
}

function buildWorkPayload(slug: string) {
  return {
    slug,
    title: 'Reforma de estofado automotivo',
    description: 'Reforma completa realizada em estofado automotivo.',
    category: 'bancos',
    tags: ['couro'],
    status: 'published',
  };
}

async function createWork(
  app: ReturnType<typeof createApp>,
  accessToken: string,
  slug: string,
): Promise<string> {
  const response = await request(app)
    .post('/works')
    .set('Authorization', `Bearer ${accessToken}`)
    .send(buildWorkPayload(slug))
    .expect(201);

  const work = response.body as WorkResponseBody;

  return work.id;
}

/**
 * CARSHOP-103 — FR-006 (partial)/FR-007–FR-010 / AC-003, AC-004, AC-005:
 * cobertura E2E permanente de `DELETE /admin/works/:workId`, incluindo o
 * ramo de cascata de imagem.
 */
describe('Admin work hard-delete (e2e)', () => {
  let app: ReturnType<typeof createApp>;
  let imageStorage: FakeImageStorageAdapter;

  beforeAll(async () => {
    if (!process.env.MONGO_URI) {
      throw new Error(
        'MONGO_URI não foi definida. O globalSetup do Jest deveria tê-la configurado antes dos testes.',
      );
    }

    await connectDatabase(process.env.MONGO_URI);
  });

  afterAll(async () => {
    await disconnectDatabase();
  });

  beforeEach(() => {
    process.env.JWT_SECRET = 'e2e-secret';
    process.env.ADMIN_EMAIL = 'admin@carshop.com';
    process.env.ADMIN_PASSWORD = '123456';
    process.env.JWT_EXPIRES_IN = '15m';
    process.env.JWT_REFRESH_EXPIRES_IN = '7d';
    imageStorage = new FakeImageStorageAdapter();
    app = createApp({ imageStorage });
  });

  it('rejects DELETE /admin/works/:workId without authentication with 401 (FR-007/AC-004)', async () => {
    await request(app)
      .delete(`/admin/works/never-existed-${Date.now()}`)
      .expect(401);
  });

  it('deletes an existing work when authenticated and the work disappears from subsequent reads (FR-008/AC-004)', async () => {
    const accessToken = await loginAsAdmin(app);
    const slug = `hard-delete-success-${Date.now()}`;
    const workId = await createWork(app, accessToken, slug);

    await request(app)
      .delete(`/admin/works/${workId}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    const listResponse = await request(app).get('/works').expect(200);
    const works = listResponse.body as WorkResponseBody[];

    expect(works.some((work) => work.slug === slug)).toBe(false);
  });

  // Same not-found assertion also serves as evidence for FR-006/AC-003
  // (a mutating work-identifier endpoint returning 404 for an unknown id).
  it('returns 404 when deleting an already-deleted or never-existing work identifier (FR-009/AC-004, FR-006/AC-003)', async () => {
    const accessToken = await loginAsAdmin(app);
    const slug = `hard-delete-not-found-${Date.now()}`;
    const workId = await createWork(app, accessToken, slug);

    await request(app)
      .delete(`/admin/works/${workId}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    await request(app)
      .delete(`/admin/works/${workId}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(404);

    await request(app)
      .delete(`/admin/works/never-existed-${Date.now()}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(404);
  });

  it('deletes a work and its associated image from external storage (image-cascade branch, FR-010/AC-005)', async () => {
    const accessToken = await loginAsAdmin(app);
    const slug = `hard-delete-with-image-${Date.now()}`;
    const workId = await createWork(app, accessToken, slug);

    await request(app)
      .post(`/admin/works/${workId}/images`)
      .set('Authorization', `Bearer ${accessToken}`)
      .attach('file', VALID_JPEG_BUFFER, {
        filename: 'work-photo.jpg',
        contentType: 'image/jpeg',
      })
      .expect(201);

    const withImageResponse = await request(app)
      .get('/works')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    const worksWithImage = withImageResponse.body as WorkResponseBody[];
    const workWithImage = worksWithImage.find((work) => work.id === workId);
    const uploadedImagePublicId = workWithImage?.images[0]?.publicId;

    expect(workWithImage?.images.length).toBeGreaterThan(0);
    expect(uploadedImagePublicId).toEqual(expect.any(String));

    const deleteImageSpy = jest.spyOn(imageStorage, 'delete');

    await request(app)
      .delete(`/admin/works/${workId}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(deleteImageSpy).toHaveBeenCalledTimes(1);
    expect(deleteImageSpy).toHaveBeenCalledWith(uploadedImagePublicId);

    const afterDeleteResponse = await request(app).get('/works').expect(200);
    const worksAfterDelete = afterDeleteResponse.body as WorkResponseBody[];

    expect(worksAfterDelete.some((work) => work.id === workId)).toBe(false);
  });
});
