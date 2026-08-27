import request from 'supertest';
import { createApp } from '../../src/infra/server';
import {
  connectDatabase,
  disconnectDatabase,
} from '../../src/infra/database/mongoose';
import { FakeImageStorageAdapter } from './support/fake-image-storage.adapter';

interface AuthResponseBody {
  accessToken: string;
  sessionId: string;
  tokenType: 'Bearer';
}

interface WorkResponseBody {
  id: string;
  slug: string;
  images: Array<{ id: string }>;
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

async function createWork(
  app: ReturnType<typeof createApp>,
  accessToken: string,
  slug: string,
): Promise<string> {
  const response = await request(app)
    .post('/works')
    .set('Authorization', `Bearer ${accessToken}`)
    .send({
      slug,
      title: 'Reforma de bancos para upload de imagem',
      description: 'Reforma completa usada para testar upload de imagem.',
      category: 'bancos',
      tags: ['couro'],
      status: 'published',
    })
    .expect(201);

  const work = response.body as WorkResponseBody;

  return work.id;
}

const FAKE_JPEG_BUFFER = Buffer.from([
  0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01,
]);

/**
 * CARSHOP-103 — FR-016–FR-019 / AC-009, AC-010, AC-011: cobertura E2E
 * permanente do upload e exclusão de imagens de trabalhos, usando o
 * `FakeImageStorageAdapter` para nunca depender de uma chamada de rede
 * real ao Cloudinary (NFR-001/NFR-002).
 */
describe('Work image upload and delete (e2e)', () => {
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

  it('rejects POST /admin/works/:workId/images without authentication with 401 (FR-016/AC-009)', async () => {
    await request(app)
      .post(`/admin/works/never-existed-${Date.now()}/images`)
      .expect(401);
  });

  it('rejects an authenticated upload with no file attached with 400, without reaching the image-storage provider (FR-017/AC-009)', async () => {
    const accessToken = await loginAsAdmin(app);
    const workId = await createWork(
      app,
      accessToken,
      `image-no-file-${Date.now()}`,
    );
    const uploadSpy = jest.spyOn(imageStorage, 'upload');

    await request(app)
      .post(`/admin/works/${workId}/images`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(400);

    expect(uploadSpy).not.toHaveBeenCalled();
  });

  it('rejects an authenticated upload with a disallowed MIME type with 415, without reaching the image-storage provider (FR-017/AC-009, documented 400→415 deviation)', async () => {
    const accessToken = await loginAsAdmin(app);
    const workId = await createWork(
      app,
      accessToken,
      `image-bad-mime-${Date.now()}`,
    );
    const uploadSpy = jest.spyOn(imageStorage, 'upload');

    await request(app)
      .post(`/admin/works/${workId}/images`)
      .set('Authorization', `Bearer ${accessToken}`)
      .attach('file', Buffer.from('not-an-image'), {
        filename: 'not-an-image.txt',
        contentType: 'text/plain',
      })
      .expect(415);

    expect(uploadSpy).not.toHaveBeenCalled();
  });

  it('accepts an authenticated upload with a valid image file and reflects the newly stored image (FR-018/AC-010)', async () => {
    const accessToken = await loginAsAdmin(app);
    const workId = await createWork(
      app,
      accessToken,
      `image-success-${Date.now()}`,
    );

    await request(app)
      .post(`/admin/works/${workId}/images`)
      .set('Authorization', `Bearer ${accessToken}`)
      .attach('file', FAKE_JPEG_BUFFER, {
        filename: 'work-photo.jpg',
        contentType: 'image/jpeg',
      })
      .expect(201);

    const listResponse = await request(app)
      .get('/works')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    const works = listResponse.body as WorkResponseBody[];
    const work = works.find((candidate) => candidate.id === workId);

    expect(work?.images.length).toBe(1);
  });

  it('rejects DELETE /admin/works/:workId/images/:imageId without authentication with 401, and returns 404 for a non-existent image without reaching the image-storage provider (FR-019/AC-011)', async () => {
    const accessToken = await loginAsAdmin(app);
    const workId = await createWork(
      app,
      accessToken,
      `image-delete-guard-${Date.now()}`,
    );

    await request(app)
      .delete(`/admin/works/${workId}/images/never-existed`)
      .expect(401);

    const deleteSpy = jest.spyOn(imageStorage, 'delete');

    await request(app)
      .delete(`/admin/works/${workId}/images/never-existed`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(404);

    expect(deleteSpy).not.toHaveBeenCalled();
  });
});
