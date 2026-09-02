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

// The dedicated login rate limiter (CARSHOP-108) allows 5 attempts per 5
// minutes per IP+email. This file's loginAsAdmin() calls share that bucket,
// so keep the total successful+failed login calls in this file at or below
// 5 — one more will start failing with an unrelated 429.
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

// Sessions are persisted in Mongo (MongoSessionStoreRepository), shared by
// every `app` instance created in this file's `beforeEach`, so a single
// access token minted once remains valid across all `app` instances in this
// suite. CARSHOP-109 adds several authenticated-upload tests; sharing one
// cached login (instead of calling loginAsAdmin() per test) keeps this
// file's total login calls well below the 5-per-5-minutes budget above.
let cachedAccessToken: string | undefined;

async function getSharedAccessToken(
  app: ReturnType<typeof createApp>,
): Promise<string> {
  if (!cachedAccessToken) {
    cachedAccessToken = await loginAsAdmin(app);
  }

  return cachedAccessToken;
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

// CARSHOP-109 — structurally complete fixtures: content-validation
// middleware now inspects real bytes (SOI+EOI for JPEG, signature+IEND for
// PNG, RIFF/WEBP/fourCC+size for WebP), not only the declared Content-Type.
const FAKE_JPEG_BUFFER = Buffer.from([
  0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01,
  0xff, 0xd9,
]);

const FAKE_PNG_BUFFER = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x00,
  0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82,
]);

const FAKE_WEBP_BUFFER = Buffer.from([
  0x52, 0x49, 0x46, 0x46, // RIFF
  0x0c, 0x00, 0x00, 0x00, // size = 12 (LE)
  0x57, 0x45, 0x42, 0x50, // WEBP
  0x56, 0x50, 0x38, 0x20, // "VP8 "
  0x00, 0x00, 0x00, 0x00, // filler payload
]);

// Structurally valid PNG signature but missing the IEND footer.
const TRUNCATED_PNG_BUFFER = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
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
    const accessToken = await getSharedAccessToken(app);
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
    const accessToken = await getSharedAccessToken(app);
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
    const accessToken = await getSharedAccessToken(app);
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

  // CARSHOP-109 — FR-001/FR-008, AC-003, AC-008: a genuinely valid PNG,
  // correctly declared, is accepted (real content matches declared MIME).
  it('accepts an authenticated upload with a valid PNG file (CARSHOP-109, AC-003, AC-008)', async () => {
    const accessToken = await getSharedAccessToken(app);
    const workId = await createWork(
      app,
      accessToken,
      `image-valid-png-${Date.now()}`,
    );
    const uploadSpy = jest.spyOn(imageStorage, 'upload');

    await request(app)
      .post(`/admin/works/${workId}/images`)
      .set('Authorization', `Bearer ${accessToken}`)
      .attach('file', FAKE_PNG_BUFFER, {
        filename: 'work-photo.png',
        contentType: 'image/png',
      })
      .expect(201);

    expect(uploadSpy).toHaveBeenCalledTimes(1);
  });

  // CARSHOP-109 — FR-001/FR-008, AC-003, AC-008: a genuinely valid WebP,
  // correctly declared, is accepted (real content matches declared MIME).
  it('accepts an authenticated upload with a valid WebP file (CARSHOP-109, AC-003, AC-008)', async () => {
    const accessToken = await getSharedAccessToken(app);
    const workId = await createWork(
      app,
      accessToken,
      `image-valid-webp-${Date.now()}`,
    );
    const uploadSpy = jest.spyOn(imageStorage, 'upload');

    await request(app)
      .post(`/admin/works/${workId}/images`)
      .set('Authorization', `Bearer ${accessToken}`)
      .attach('file', FAKE_WEBP_BUFFER, {
        filename: 'work-photo.webp',
        contentType: 'image/webp',
      })
      .expect(201);

    expect(uploadSpy).toHaveBeenCalledTimes(1);
  });

  // CARSHOP-109 — FR-001/FR-002, AC-001: declared MIME is allowed, but the
  // real body content is not an image at all (spoofed Content-Type).
  it('rejects an upload declaring an allowed MIME type but sending non-image content, without reaching the image-storage provider (CARSHOP-109, AC-001)', async () => {
    const accessToken = await getSharedAccessToken(app);
    const workId = await createWork(
      app,
      accessToken,
      `image-spoofed-content-${Date.now()}`,
    );
    const uploadSpy = jest.spyOn(imageStorage, 'upload');

    await request(app)
      .post(`/admin/works/${workId}/images`)
      .set('Authorization', `Bearer ${accessToken}`)
      .attach('file', Buffer.from('<html>not an image</html>'), {
        filename: 'fake-photo.jpg',
        contentType: 'image/jpeg',
      })
      .expect(415);

    expect(uploadSpy).not.toHaveBeenCalled();
  });

  // CARSHOP-109 — FR-001/FR-003, AC-002: declared MIME is allowed, the body
  // starts with a valid PNG signature but is truncated/incomplete.
  it('rejects an upload declaring an allowed MIME type but sending a truncated/corrupted image, without reaching the image-storage provider (CARSHOP-109, AC-002)', async () => {
    const accessToken = await getSharedAccessToken(app);
    const workId = await createWork(
      app,
      accessToken,
      `image-truncated-content-${Date.now()}`,
    );
    const uploadSpy = jest.spyOn(imageStorage, 'upload');

    await request(app)
      .post(`/admin/works/${workId}/images`)
      .set('Authorization', `Bearer ${accessToken}`)
      .attach('file', TRUNCATED_PNG_BUFFER, {
        filename: 'incomplete-photo.png',
        contentType: 'image/png',
      })
      .expect(415);

    expect(uploadSpy).not.toHaveBeenCalled();
  });

  // CARSHOP-109 — FR-004, AC-004: declared and detected types are both
  // individually allowed but disagree (declared PNG, real content is a
  // valid JPEG). The reject-on-mismatch coherence rule applies.
  it('rejects an upload when the declared MIME type disagrees with the real detected content, even though both are individually allowed (CARSHOP-109, AC-004)', async () => {
    const accessToken = await getSharedAccessToken(app);
    const workId = await createWork(
      app,
      accessToken,
      `image-mismatch-content-${Date.now()}`,
    );
    const uploadSpy = jest.spyOn(imageStorage, 'upload');

    await request(app)
      .post(`/admin/works/${workId}/images`)
      .set('Authorization', `Bearer ${accessToken}`)
      .attach('file', FAKE_JPEG_BUFFER, {
        filename: 'mislabeled-photo.png',
        contentType: 'image/png',
      })
      .expect(415);

    expect(uploadSpy).not.toHaveBeenCalled();
  });

  it('rejects DELETE /admin/works/:workId/images/:imageId without authentication with 401, and returns 404 for a non-existent image without reaching the image-storage provider (FR-019/AC-011)', async () => {
    const accessToken = await getSharedAccessToken(app);
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

  // CARSHOP-103 Addendum A — FR-A06/AC-A05: standalone success path of
  // DELETE /admin/works/:workId/images/:imageId, distinct from the admin
  // work hard-delete cascade already covered elsewhere.
  it('deletes an existing image and preserves the work while removing only that image (FR-A06/AC-A05)', async () => {
    const accessToken = await getSharedAccessToken(app);
    const workId = await createWork(
      app,
      accessToken,
      `image-delete-success-${Date.now()}`,
    );

    await request(app)
      .post(`/admin/works/${workId}/images`)
      .set('Authorization', `Bearer ${accessToken}`)
      .attach('file', FAKE_JPEG_BUFFER, {
        filename: 'work-photo.jpg',
        contentType: 'image/jpeg',
      })
      .expect(201);

    const beforeDeleteResponse = await request(app)
      .get('/works')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    const worksBeforeDelete = beforeDeleteResponse.body as WorkResponseBody[];
    const workBeforeDelete = worksBeforeDelete.find(
      (candidate) => candidate.id === workId,
    );
    const uploadedImageId = workBeforeDelete?.images[0]?.id;

    expect(workBeforeDelete?.images.length).toBe(1);
    expect(uploadedImageId).toEqual(expect.any(String));

    const deleteSpy = jest.spyOn(imageStorage, 'delete');

    await request(app)
      .delete(`/admin/works/${workId}/images/${uploadedImageId}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(deleteSpy).toHaveBeenCalledTimes(1);

    const afterDeleteResponse = await request(app)
      .get('/works')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    const worksAfterDelete = afterDeleteResponse.body as WorkResponseBody[];
    const workAfterDelete = worksAfterDelete.find(
      (candidate) => candidate.id === workId,
    );

    expect(workAfterDelete).toBeDefined();
    expect(workAfterDelete?.images.length).toBe(0);
  });
});
