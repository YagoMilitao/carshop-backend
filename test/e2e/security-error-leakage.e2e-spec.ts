import request from 'supertest';
import { createApp } from '../../src/infra/server';
import {
  connectDatabase,
  disconnectDatabase,
} from '../../src/infra/database/mongoose';
import { loginAsAdmin } from './support/security-test.helpers';
import { FailingImageStorageAdapter } from './support/failing-image-storage.adapter';
import { MAX_IMAGE_SIZE_BYTES } from '../../src/infra/middleware/upload.middleware';

const ADMIN_EMAIL = 'admin@carshop.com';
const ADMIN_PASSWORD = '123456';

/**
 * Matches stack-trace-like signatures (TypeScript source location or a
 * Node.js call-frame line) and local filesystem path prefixes.
 */
const LEAKAGE_PATTERN = /\.ts:\d+|\/Users\/|at\s+\w+\s+\(/;

/**
 * Secret/credential-adjacent substrings that must never appear in an error
 * response body, regardless of status code.
 */
const SECRET_ADJACENT_SUBSTRINGS = [
  'JWT_SECRET',
  'ADMIN_PASSWORD',
  'MONGO_URI',
  'CLOUDINARY_API_SECRET',
];

interface WorkResponseBody {
  id: string;
}

function assertNoLeakage(response: {
  body: unknown;
  text: string;
}): void {
  expect(response.body).not.toHaveProperty('stack');

  const serializedBody = JSON.stringify(response.body);
  expect(serializedBody).not.toMatch(LEAKAGE_PATTERN);

  for (const secretSubstring of SECRET_ADJACENT_SUBSTRINGS) {
    expect(serializedBody).not.toContain(secretSubstring);
  }

  expect(response.text).not.toMatch(/<html/i);
}

/**
 * CARSHOP-111 — E2E coverage proving representative error responses never
 * leak stack traces, local filesystem paths, or secret/credential detail.
 *
 * Traceability:
 * - FR-013/AC-006: representative 4xx/5xx error responses produced by the
 *   application's error handler contain no stack trace, no local
 *   filesystem path, and no secret/credential detail.
 */
describe('Error response leakage prevention (e2e, CARSHOP-111)', () => {
  let app: ReturnType<typeof createApp>;

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
    process.env.ADMIN_EMAIL = ADMIN_EMAIL;
    process.env.ADMIN_PASSWORD = ADMIN_PASSWORD;
    process.env.JWT_EXPIRES_IN = '15m';
    process.env.JWT_REFRESH_EXPIRES_IN = '7d';
  });

  it('does not leak internals on a 400 (malformed JSON body) (FR-013/AC-006)', async () => {
    app = createApp();

    const response = await request(app)
      .post('/auth/login')
      .set('Content-Type', 'application/json')
      .send('{not-valid-json')
      .expect(400);

    assertNoLeakage(response);
  });

  it('does not leak internals on a 401 (unauthenticated access to a protected route) (FR-013/AC-006)', async () => {
    app = createApp();

    const response = await request(app).get('/auth/session').expect(401);

    assertNoLeakage(response);
  });

  it('does not leak internals on a 403 (CSRF failure) (FR-013/AC-006)', async () => {
    app = createApp();

    const login = await loginAsAdmin(app, ADMIN_EMAIL, ADMIN_PASSWORD);

    const response = await request(app)
      .post('/auth/logout')
      .set('Cookie', [login.refreshCookie, login.csrfCookie])
      .expect(403);

    assertNoLeakage(response);
  });

  // Uses the upload flow's Multer file-size limit (correctly translated to
  // 413 by `normalizeUploadError`) as the representative 413 source. The
  // JSON body-size limit also now correctly returns 413 as of the
  // CARSHOP-111 `errorHandlerMiddleware` fix (see
  // `security-body-size-limit.e2e-spec.ts`), but this scenario keeps using
  // the upload path to also exercise `normalizeUploadError`'s translation.
  it('does not leak internals on a 413 (oversized upload file) (FR-013/AC-006)', async () => {
    const imageStorage = new FailingImageStorageAdapter();
    app = createApp({ imageStorage });

    const login = await loginAsAdmin(app, ADMIN_EMAIL, ADMIN_PASSWORD);

    const workResponse = await request(app)
      .post('/works')
      .set('Authorization', `Bearer ${login.accessToken}`)
      .send({
        slug: `error-leakage-413-${Date.now()}`,
        title: 'Reforma usada para forçar uma falha de tamanho de upload (CARSHOP-111)',
        description:
          'Trabalho criado apenas para exercitar o caminho de erro 413 do upload de imagem.',
        category: 'bancos',
        tags: ['couro'],
        status: 'published',
      })
      .expect(201);
    const work = workResponse.body as WorkResponseBody;

    const oversizedImageBuffer = Buffer.alloc(MAX_IMAGE_SIZE_BYTES + 1024, 0xff);

    const response = await request(app)
      .post(`/admin/works/${work.id}/images`)
      .set('Authorization', `Bearer ${login.accessToken}`)
      .attach('file', oversizedImageBuffer, {
        filename: 'oversized-photo.jpg',
        contentType: 'image/jpeg',
      })
      .expect(413);

    assertNoLeakage(response);
  });

  it('does not leak internals on a 500 (unexpected image-storage failure) (FR-013/AC-006)', async () => {
    const imageStorage = new FailingImageStorageAdapter();
    app = createApp({ imageStorage });

    const login = await loginAsAdmin(app, ADMIN_EMAIL, ADMIN_PASSWORD);

    const workResponse = await request(app)
      .post('/works')
      .set('Authorization', `Bearer ${login.accessToken}`)
      .send({
        slug: `error-leakage-500-${Date.now()}`,
        title: 'Reforma usada para forçar uma falha de upload (CARSHOP-111)',
        description:
          'Trabalho criado apenas para exercitar o caminho de erro 500 do upload de imagem.',
        category: 'bancos',
        tags: ['couro'],
        status: 'published',
      })
      .expect(201);
    const work = workResponse.body as WorkResponseBody;

    // CARSHOP-109: content-validation middleware now inspects real bytes
    // (SOI + EOI), so this fixture must be structurally complete to reach
    // the storage-failure code path this test exercises.
    const FAKE_JPEG_BUFFER = Buffer.from([
      0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01,
      0xff, 0xd9,
    ]);

    const response = await request(app)
      .post(`/admin/works/${work.id}/images`)
      .set('Authorization', `Bearer ${login.accessToken}`)
      .attach('file', FAKE_JPEG_BUFFER, {
        filename: 'work-photo.jpg',
        contentType: 'image/jpeg',
      })
      .expect(500);

    assertNoLeakage(response);
    expect(response.body).toEqual({ message: 'Erro interno no servidor.' });
  });

  // Ordered last: `globalRateLimitMiddleware` is a module-level singleton
  // shared by every request in this file/module registry (its counter
  // persists across `it` blocks). Once tripped, subsequent requests in
  // this file would also receive 429, so this scenario must run after
  // every other scenario that depends on a non-429 status.
  it('does not leak internals on a 429 (global rate limit exceeded) (FR-013/AC-006)', async () => {
    app = createApp();

    // RFC 5737 TEST-NET-2 — reserved for documentation/example use, unique
    // to this file to avoid bucket collisions with other spec files.
    const RATE_LIMIT_IP = '198.51.100.201';

    let lastResponse: { body: unknown; text: string; status: number } | undefined;
    for (let attempt = 1; attempt <= 101; attempt += 1) {
      lastResponse = await request(app)
        .get('/')
        .set('X-Forwarded-For', RATE_LIMIT_IP);
    }

    expect(lastResponse?.status).toBe(429);
    if (lastResponse) {
      assertNoLeakage(lastResponse);
    }
  });
});
