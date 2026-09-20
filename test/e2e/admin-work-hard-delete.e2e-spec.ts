import request from 'supertest';
import { createApp } from '../../src/infra/server';
import {
  connectDatabase,
  disconnectDatabase,
} from '../../src/infra/database/mongoose';
import { FakeImageStorageAdapter } from './support/fake-image-storage.adapter';
import { VALID_JPEG_BUFFER } from './support/valid-image-fixtures';
import { AuthSessionModel } from '../../src/data/models/auth-session.model';

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
  const loginBody = await loginAsAdminWithSession(app);

  return loginBody.accessToken;
}

async function loginAsAdminWithSession(
  app: ReturnType<typeof createApp>,
): Promise<AuthResponseBody> {
  const loginResponse = await request(app)
    .post('/auth/login')
    .send({ email: process.env.ADMIN_EMAIL, password: '123456' })
    .expect(200);

  return loginResponse.body as AuthResponseBody;
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
  // The login limiter is a module-level singleton keyed by IP + email.
  // A distinct admin email per test keeps each case in an isolated bucket.
  let testSequence = 0;

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
    testSequence += 1;
    process.env.JWT_SECRET = 'e2e-secret';
    process.env.ADMIN_EMAIL = `admin-hard-delete-${testSequence}@carshop.com`;
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
      .query({ includeDrafts: 'true' })
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

  it('reports irreversible partial deletion and allows a safe retry (CARSHOP-129/AC-001/AC-002)', async () => {
    const accessToken = await loginAsAdmin(app);
    const slug = `hard-delete-partial-${Date.now()}`;
    const workId = await createWork(app, accessToken, slug);

    for (const filename of ['first-photo.jpg', 'second-photo.jpg']) {
      await request(app)
        .post(`/admin/works/${workId}/images`)
        .set('Authorization', `Bearer ${accessToken}`)
        .attach('file', VALID_JPEG_BUFFER, {
          filename,
          contentType: 'image/jpeg',
        })
        .expect(201);
    }

    const deleteImageSpy = jest
      .spyOn(imageStorage, 'delete')
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error('Simulated upstream failure.'));
    const consoleErrorSpy = jest
      .spyOn(console, 'error')
      .mockImplementation(() => {});

    const partialFailureResponse = await request(app)
      .delete(`/admin/works/${workId}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(502);

    consoleErrorSpy.mockRestore();

    expect(partialFailureResponse.body).toEqual({
      message:
        'Falha parcial ao remover arquivos do armazenamento externo. Algumas imagens já foram removidas. Tente novamente para concluir a operação.',
      details: {
        code: 'PARTIAL_IMAGE_DELETION',
        retryable: true,
        removedImagesCount: 1,
        remainingImagesCount: 1,
      },
    });

    const afterPartialFailure = await request(app).get('/works').expect(200);
    const worksAfterPartialFailure =
      afterPartialFailure.body as WorkResponseBody[];

    expect(worksAfterPartialFailure.some((work) => work.id === workId)).toBe(
      true,
    );

    deleteImageSpy.mockReset();
    deleteImageSpy.mockResolvedValue(undefined);

    await request(app)
      .delete(`/admin/works/${workId}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200, { success: true });

    const afterRetryResponse = await request(app).get('/works').expect(200);
    const worksAfterRetry = afterRetryResponse.body as WorkResponseBody[];

    expect(worksAfterRetry.some((work) => work.id === workId)).toBe(false);
  });

  // CARSHOP-138 — FR-004/AC-002: a token bound to a session revoked in
  // SessionStorePort must be rejected with 401 on DELETE
  // /admin/works/:workId, without deleting the work.
  it('rejects DELETE /admin/works/:workId with 401 when the session has been revoked, and does not delete the work (FR-004/AC-002)', async () => {
    const login = await loginAsAdminWithSession(app);
    const slug = `hard-delete-revoked-session-${Date.now()}`;
    const workId = await createWork(app, login.accessToken, slug);

    // Mirrors MongoSessionStoreRepository.revoke()'s own update shape.
    await AuthSessionModel.findOneAndUpdate(
      { id: login.sessionId },
      { revokedAt: Date.now() },
    );

    await request(app)
      .delete(`/admin/works/${workId}`)
      .set('Authorization', `Bearer ${login.accessToken}`)
      .expect(401);

    const listResponse = await request(app).get('/works').expect(200);
    const works = listResponse.body as WorkResponseBody[];

    expect(works.some((work) => work.slug === slug)).toBe(true);
  });

  // CARSHOP-139 — Gap A / FR-002/FR-004/FR-009 / AC-004/AC-009: a Mongo
  // operator-style or prototype-pollution-style workId route param must be
  // rejected before any query reaches MongoDB.
  it.each([
    ['operador Mongo ($ne)', '$ne'],
    ['chave com ponto (a.b)', 'a.b'],
    ['prototype pollution (__proto__)', '__proto__'],
  ])(
    'rejects DELETE /admin/works/:workId with 400 for a malicious identifier (%s) and does not mutate any document (CARSHOP-139 FR-002/FR-004/FR-009/AC-004/AC-009)',
    async (_label, maliciousWorkId) => {
      const accessToken = await loginAsAdmin(app);
      const slug = `hard-delete-malicious-id-${Date.now()}`;
      const workId = await createWork(app, accessToken, slug);

      await request(app)
        .delete(`/admin/works/${encodeURIComponent(maliciousWorkId)}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(400);

      const listResponse = await request(app).get('/works').expect(200);
      const works = listResponse.body as WorkResponseBody[];

      expect(works.some((work) => work.id === workId)).toBe(true);
    },
  );
});
