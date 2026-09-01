import request from 'supertest';
import { createApp } from '../../src/infra/server';
import {
  connectDatabase,
  disconnectDatabase,
} from '../../src/infra/database/mongoose';
import { AuthSessionModel } from '../../src/data/models/auth-session.model';
import { getSetCookieArray, extractCookie } from './support/security-test.helpers';

const ADMIN_EMAIL = 'admin@carshop.com';
const ADMIN_PASSWORD = '123456';

/**
 * CARSHOP-111 — E2E coverage for the global JSON body-size limit.
 *
 * Traceability:
 * - FR-004/AC-003: a JSON body larger than the configured 1 MB limit must
 *   be rejected with HTTP 413 before the target route's handler logic
 *   executes (no session/cookie side effects on `POST /auth/login`).
 *
 * NOTE — CARSHOP-111 defect fix: `express.json({ limit: '1mb' })`
 * (body-parser/raw-body) rejects an oversized body with an
 * `http-errors`-style object (`status`/`statusCode` = 413,
 * `type: 'entity.too.large'`). This previously fell through
 * `errorHandlerMiddleware`'s generic branch and returned HTTP 500 instead
 * of the AC-003/FR-004-required 413. This was fixed under CARSHOP-111 by
 * adding a narrow `isPayloadTooLargeError` guard/branch to
 * `errorHandlerMiddleware`
 * (`src/infra/presentation/middleware/error-handler.middleware.ts`), which
 * now returns HTTP 413 with a static message for this error shape. This
 * suite now asserts the corrected, spec-compliant status.
 */
describe('JSON body-size limit (e2e, CARSHOP-111)', () => {
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
    app = createApp();
  });

  it('rejects a JSON body over 1 MB sent to POST /auth/login before route logic executes, without creating a session or issuing cookies (FR-004/AC-003)', async () => {
    const sessionCountBefore = await AuthSessionModel.countDocuments({
      email: ADMIN_EMAIL,
    });

    // 1 MB = 1_048_576 bytes; pad comfortably past that so the oversized
    // payload is unambiguous regardless of JSON serialization overhead.
    const oversizedPassword = 'a'.repeat(1024 * 1024 + 1024);

    const response = await request(app)
      .post('/auth/login')
      .send({ email: ADMIN_EMAIL, password: oversizedPassword })
      .expect(413);

    const sessionCountAfter = await AuthSessionModel.countDocuments({
      email: ADMIN_EMAIL,
    });

    const setCookie = getSetCookieArray(
      response.headers as Record<string, unknown>,
    );

    expect(extractCookie(setCookie, 'refresh_token')).toBeUndefined();
    expect(extractCookie(setCookie, 'csrf_token')).toBeUndefined();
    expect(sessionCountAfter).toBe(sessionCountBefore);
  });
});
