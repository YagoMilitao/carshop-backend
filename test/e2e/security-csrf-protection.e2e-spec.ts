import request from 'supertest';
import { createApp } from '../../src/infra/server';
import {
  connectDatabase,
  disconnectDatabase,
} from '../../src/infra/database/mongoose';
import { AuthSessionModel } from '../../src/data/models/auth-session.model';
import { loginAsAdmin } from './support/security-test.helpers';

const ADMIN_EMAIL = 'admin@carshop.com';
const ADMIN_PASSWORD = '123456';

interface SessionResponseBody {
  email: string;
  sessionId: string;
  expiresAt: string;
}

/**
 * CARSHOP-111 — E2E coverage for the double-submit CSRF protection on
 * `POST /auth/refresh` and `POST /auth/logout`.
 *
 * Traceability:
 * - FR-005/FR-006/FR-007/FR-008/AC-004: refresh/logout fail (403) and do
 *   not alter session state when the CSRF cookie/header pair is missing or
 *   mismatched. `csrfProtectionMiddleware` runs before the controller on
 *   both routes, so a CSRF failure structurally never reaches
 *   `AuthService`; session-state-unaltered is asserted both via
 *   `AuthSessionModel.countDocuments` and by re-using the original
 *   still-valid access token against `GET /auth/session` afterward.
 */
describe('CSRF double-submit protection on refresh/logout (e2e, CARSHOP-111)', () => {
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

  it('rejects POST /auth/refresh with 403 and leaves session state unaltered when the X-CSRF-Token header is missing (FR-005/AC-004)', async () => {
    const login = await loginAsAdmin(app, ADMIN_EMAIL, ADMIN_PASSWORD);
    const sessionCountBefore = await AuthSessionModel.countDocuments({
      email: ADMIN_EMAIL,
    });

    await request(app)
      .post('/auth/refresh')
      .set('Cookie', [login.refreshCookie, login.csrfCookie])
      .expect(403);

    const sessionCountAfter = await AuthSessionModel.countDocuments({
      email: ADMIN_EMAIL,
    });
    expect(sessionCountAfter).toBe(sessionCountBefore);

    const sessionResponse = await request(app)
      .get('/auth/session')
      .set('Authorization', `Bearer ${login.accessToken}`)
      .expect(200);
    const sessionBody = sessionResponse.body as SessionResponseBody;
    expect(sessionBody.sessionId).toBe(login.sessionId);
  });

  it('rejects POST /auth/refresh with 403 and leaves session state unaltered when X-CSRF-Token mismatches the cookie (FR-006/AC-004)', async () => {
    const login = await loginAsAdmin(app, ADMIN_EMAIL, ADMIN_PASSWORD);
    const sessionCountBefore = await AuthSessionModel.countDocuments({
      email: ADMIN_EMAIL,
    });

    await request(app)
      .post('/auth/refresh')
      .set('Cookie', [login.refreshCookie, login.csrfCookie])
      .set('X-CSRF-Token', 'mismatched-csrf-token-value')
      .expect(403);

    const sessionCountAfter = await AuthSessionModel.countDocuments({
      email: ADMIN_EMAIL,
    });
    expect(sessionCountAfter).toBe(sessionCountBefore);

    const sessionResponse = await request(app)
      .get('/auth/session')
      .set('Authorization', `Bearer ${login.accessToken}`)
      .expect(200);
    const sessionBody = sessionResponse.body as SessionResponseBody;
    expect(sessionBody.sessionId).toBe(login.sessionId);
  });

  it('rejects POST /auth/logout with 403 and leaves session state unaltered when the X-CSRF-Token header is missing (FR-007/AC-004)', async () => {
    const login = await loginAsAdmin(app, ADMIN_EMAIL, ADMIN_PASSWORD);
    const sessionCountBefore = await AuthSessionModel.countDocuments({
      email: ADMIN_EMAIL,
    });

    await request(app)
      .post('/auth/logout')
      .set('Cookie', [login.refreshCookie, login.csrfCookie])
      .expect(403);

    const sessionCountAfter = await AuthSessionModel.countDocuments({
      email: ADMIN_EMAIL,
    });
    expect(sessionCountAfter).toBe(sessionCountBefore);

    const sessionResponse = await request(app)
      .get('/auth/session')
      .set('Authorization', `Bearer ${login.accessToken}`)
      .expect(200);
    const sessionBody = sessionResponse.body as SessionResponseBody;
    expect(sessionBody.sessionId).toBe(login.sessionId);
  });

  it('rejects POST /auth/logout with 403 and leaves session state unaltered when X-CSRF-Token mismatches the cookie (FR-008/AC-004)', async () => {
    const login = await loginAsAdmin(app, ADMIN_EMAIL, ADMIN_PASSWORD);
    const sessionCountBefore = await AuthSessionModel.countDocuments({
      email: ADMIN_EMAIL,
    });

    await request(app)
      .post('/auth/logout')
      .set('Cookie', [login.refreshCookie, login.csrfCookie])
      .set('X-CSRF-Token', 'mismatched-csrf-token-value')
      .expect(403);

    const sessionCountAfter = await AuthSessionModel.countDocuments({
      email: ADMIN_EMAIL,
    });
    expect(sessionCountAfter).toBe(sessionCountBefore);

    const sessionResponse = await request(app)
      .get('/auth/session')
      .set('Authorization', `Bearer ${login.accessToken}`)
      .expect(200);
    const sessionBody = sessionResponse.body as SessionResponseBody;
    expect(sessionBody.sessionId).toBe(login.sessionId);
  });
});
