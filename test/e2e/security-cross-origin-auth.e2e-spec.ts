import request from 'supertest';
import type { createApp as CreateAppType } from '../../src/infra/server';
import type {
  connectDatabase as ConnectDatabaseType,
  disconnectDatabase as DisconnectDatabaseType,
} from '../../src/infra/database/mongoose';
import type { AuthSessionModel as AuthSessionModelType } from '../../src/data/models/auth-session.model';

const ADMIN_EMAIL = 'admin@carshop.com';
const ADMIN_PASSWORD = '123456';
const ALLOWED_ORIGIN = 'https://allowed.e2e.test';

interface AuthResponseBody {
  accessToken: string;
  sessionId: string;
  tokenType: 'Bearer';
}

interface SessionResponseBody {
  email: string;
  sessionId: string;
  expiresAt: string;
}

function getSetCookieArray(headers: Record<string, unknown>): string[] {
  const rawSetCookie = headers['set-cookie'];
  if (Array.isArray(rawSetCookie)) {
    return rawSetCookie as string[];
  }
  if (typeof rawSetCookie === 'string') {
    return [rawSetCookie];
  }
  return [];
}

function extractCookie(
  setCookie: string[],
  cookieName: string,
): string | undefined {
  const cookie = setCookie.find((entry) => entry.startsWith(`${cookieName}=`));
  return cookie?.split(';')[0];
}

function extractFullSetCookie(
  setCookie: string[],
  cookieName: string,
): string | undefined {
  return setCookie.find((entry) => entry.startsWith(`${cookieName}=`));
}

/**
 * CARSHOP-126 — E2E coverage for the cross-origin auth flow
 * (login → refresh → logout) after `SameSite=None; Secure` was adopted
 * for `refresh_token`/`csrf_token` to support a frontend hosted on a
 * different origin than the backend.
 *
 * Traceability:
 * - AC-001/FR-001/FR-008/NFR-004: POST /auth/refresh from an allowed
 *   cross-origin `Origin`, with valid cookies and matching
 *   `X-CSRF-Token`, succeeds with a new accessToken and rotated cookies
 *   carrying `SameSite=None`, `Secure`, `HttpOnly` (refresh_token).
 * - AC-002/FR-002: same cross-origin scenario for POST /auth/logout;
 *   a subsequent refresh against the revoked session fails.
 * - AC-003/FR-004/FR-005/NFR-002: a mismatched/missing X-CSRF-Token in
 *   the cross-origin scenario is rejected (403) without altering session
 *   state.
 * - AC-004/FR-003: a missing refresh_token cookie in the cross-origin
 *   scenario is rejected (401).
 * - AC-007/NFR-003: none of these tests logs or asserts on the raw
 *   refresh token value outside of the `Set-Cookie`/`Cookie` mechanism —
 *   only cookie names, cookie attributes, and the (intentionally opaque)
 *   accessToken from the response body are inspected.
 *
 * Test-infrastructure note: mirrors the `jest.isolateModules` pattern
 * from `security-cors-policy.e2e-spec.ts`, required because
 * `src/infra/config/env.ts` computes `env.corsOrigins` eagerly at module
 * import time, so `CORS_ORIGIN` must be set before a fresh `createApp`
 * module graph is loaded.
 *
 * `jest.isolateModules` creates a brand-new module registry for
 * everything required inside its callback, including the `mongoose`
 * package itself and the module-scoped `loginRateLimitMiddleware`
 * singleton. This suite therefore rebuilds the isolated module graph
 * (app + `database/mongoose` connection + `AuthSessionModel`) fresh in
 * `beforeEach`/torn down in `afterEach`, for two independent reasons:
 * - the isolated app's models need an active connection bound to the
 *   *same* isolated `mongoose` instance (otherwise Mongoose operations
 *   buffer indefinitely against a disconnected singleton);
 * - `loginRateLimitMiddleware` is a module-level singleton (limit: 5
 *   login attempts per 5-minute window, counting successes too); reusing
 *   one isolated app across this file's six tests (each performing a
 *   login) would otherwise exhaust that shared limiter and produce a
 *   spurious `429` unrelated to the behavior under test.
 */
describe('Cross-origin auth flow (e2e, CARSHOP-126)', () => {
  let app: ReturnType<typeof CreateAppType>;
  let disconnectFreshDatabase: typeof DisconnectDatabaseType;
  let FreshAuthSessionModel: typeof AuthSessionModelType;

  beforeAll(() => {
    if (!process.env.MONGO_URI) {
      throw new Error(
        'MONGO_URI não foi definida. O globalSetup do Jest deveria tê-la configurado antes dos testes.',
      );
    }

    process.env.JWT_SECRET = 'e2e-secret';
    process.env.ADMIN_EMAIL = ADMIN_EMAIL;
    process.env.ADMIN_PASSWORD = ADMIN_PASSWORD;
    process.env.JWT_EXPIRES_IN = '15m';
    process.env.JWT_REFRESH_EXPIRES_IN = '7d';
    process.env.CORS_ORIGIN = ALLOWED_ORIGIN;
  });

  afterAll(() => {
    delete process.env.CORS_ORIGIN;
  });

  beforeEach(async () => {
    let freshApp: ReturnType<typeof CreateAppType> | undefined;
    let connectPromise: Promise<void> | undefined;

    jest.isolateModules(() => {
      const freshDbModule = require('../../src/infra/database/mongoose') as {
        connectDatabase: typeof ConnectDatabaseType;
        disconnectDatabase: typeof DisconnectDatabaseType;
      };
      connectPromise = freshDbModule.connectDatabase(
        process.env.MONGO_URI as string,
      );
      disconnectFreshDatabase = freshDbModule.disconnectDatabase;

      const freshServerModule = require('../../src/infra/server') as {
        createApp: typeof CreateAppType;
      };
      freshApp = freshServerModule.createApp();

      const freshAuthSessionModule =
        require('../../src/data/models/auth-session.model') as {
          AuthSessionModel: typeof AuthSessionModelType;
        };
      FreshAuthSessionModel = freshAuthSessionModule.AuthSessionModel;
    });

    await connectPromise;

    if (!freshApp) {
      throw new Error(
        'beforeEach: falha ao construir a aplicação com CORS_ORIGIN isolado.',
      );
    }

    app = freshApp;
  });

  afterEach(async () => {
    await disconnectFreshDatabase();
  });

  async function loginCrossOrigin(): Promise<{
    accessToken: string;
    sessionId: string;
    refreshCookie: string;
    csrfCookie: string;
    csrfToken: string;
  }> {
    const loginResponse = await request(app)
      .post('/auth/login')
      .set('Origin', ALLOWED_ORIGIN)
      .send({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD })
      .expect(200);

    const loginBody = loginResponse.body as AuthResponseBody;
    const setCookie = getSetCookieArray(
      loginResponse.headers as Record<string, unknown>,
    );
    const refreshCookie = extractCookie(setCookie, 'refresh_token');
    const csrfCookie = extractCookie(setCookie, 'csrf_token');
    const csrfToken = csrfCookie?.split('=')[1];

    if (!refreshCookie || !csrfCookie || !csrfToken) {
      throw new Error(
        'loginCrossOrigin: login response did not include the expected refresh_token/csrf_token cookies.',
      );
    }

    return {
      accessToken: loginBody.accessToken,
      sessionId: loginBody.sessionId,
      refreshCookie,
      csrfCookie,
      csrfToken,
    };
  }

  it('rotates access token and cookies on POST /auth/refresh from an allowed cross-origin Origin (AC-001/FR-001/FR-008/NFR-004)', async () => {
    const login = await loginCrossOrigin();

    const refreshResponse = await request(app)
      .post('/auth/refresh')
      .set('Origin', ALLOWED_ORIGIN)
      .set('Cookie', [login.refreshCookie, login.csrfCookie])
      .set('X-CSRF-Token', login.csrfToken)
      .expect(200);

    const refreshBody = refreshResponse.body as AuthResponseBody;
    expect(refreshBody.accessToken).toBeDefined();
    expect(refreshBody.accessToken).not.toBe(login.accessToken);

    const rotatedSetCookie = getSetCookieArray(
      refreshResponse.headers as Record<string, unknown>,
    );
    const rotatedRefreshFull = extractFullSetCookie(
      rotatedSetCookie,
      'refresh_token',
    );
    const rotatedCsrfFull = extractFullSetCookie(
      rotatedSetCookie,
      'csrf_token',
    );

    expect(rotatedRefreshFull).toBeDefined();
    expect(rotatedCsrfFull).toBeDefined();

    // Cookie rotation: a new refresh_token/csrf_token pair is issued,
    // distinct from the ones used in the request (name/value pair only —
    // never asserting on the raw secret value beyond equality/inequality,
    // per AC-007/NFR-003).
    expect(rotatedRefreshFull).not.toBe(login.refreshCookie);
    expect(rotatedCsrfFull).not.toBe(login.csrfCookie);

    // Cookie attributes: SameSite=None, Secure, HttpOnly (refresh_token).
    expect(rotatedRefreshFull).toMatch(/HttpOnly/i);
    expect(rotatedRefreshFull).toMatch(/Secure/i);
    expect(rotatedRefreshFull).toMatch(/SameSite=None/i);

    expect(rotatedCsrfFull).toMatch(/Secure/i);
    expect(rotatedCsrfFull).toMatch(/SameSite=None/i);
    // csrf_token must remain readable by JavaScript (double-submit
    // pattern), so it must NOT carry HttpOnly.
    expect(rotatedCsrfFull).not.toMatch(/HttpOnly/i);

    // Also confirms CORS authorization was actually granted for the
    // cross-origin request that produced this rotation.
    expect(refreshResponse.headers['access-control-allow-origin']).toBe(
      ALLOWED_ORIGIN,
    );
    expect(refreshResponse.headers['access-control-allow-credentials']).toBe(
      'true',
    );
  });

  it('revokes the session on POST /auth/logout from an allowed cross-origin Origin, invalidating a subsequent refresh (AC-002/FR-002)', async () => {
    const login = await loginCrossOrigin();

    await request(app)
      .post('/auth/logout')
      .set('Origin', ALLOWED_ORIGIN)
      .set('Cookie', [login.refreshCookie, login.csrfCookie])
      .set('X-CSRF-Token', login.csrfToken)
      .expect(200)
      .expect({ success: true });

    await request(app)
      .post('/auth/refresh')
      .set('Origin', ALLOWED_ORIGIN)
      .set('Cookie', [login.refreshCookie, login.csrfCookie])
      .set('X-CSRF-Token', login.csrfToken)
      .expect(401);
  });

  it('rejects POST /auth/refresh with 403 and leaves session state unaltered when X-CSRF-Token is missing in a cross-origin request (AC-003/NFR-002)', async () => {
    const login = await loginCrossOrigin();
    const sessionCountBefore = await FreshAuthSessionModel.countDocuments({
      email: ADMIN_EMAIL,
    });

    await request(app)
      .post('/auth/refresh')
      .set('Origin', ALLOWED_ORIGIN)
      .set('Cookie', [login.refreshCookie, login.csrfCookie])
      .expect(403);

    const sessionCountAfter = await FreshAuthSessionModel.countDocuments({
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

  it('rejects POST /auth/logout with 403 and leaves session state unaltered when X-CSRF-Token mismatches the cookie in a cross-origin request (AC-003/NFR-002)', async () => {
    const login = await loginCrossOrigin();
    const sessionCountBefore = await FreshAuthSessionModel.countDocuments({
      email: ADMIN_EMAIL,
    });

    await request(app)
      .post('/auth/logout')
      .set('Origin', ALLOWED_ORIGIN)
      .set('Cookie', [login.refreshCookie, login.csrfCookie])
      .set('X-CSRF-Token', 'mismatched-csrf-token-value')
      .expect(403);

    const sessionCountAfter = await FreshAuthSessionModel.countDocuments({
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

  it('rejects POST /auth/refresh with 401 when the refresh_token cookie is missing in a cross-origin request (AC-004/FR-003)', async () => {
    const login = await loginCrossOrigin();

    await request(app)
      .post('/auth/refresh')
      .set('Origin', ALLOWED_ORIGIN)
      .set('Cookie', [login.csrfCookie])
      .set('X-CSRF-Token', login.csrfToken)
      .expect(401);
  });

  it('rejects POST /auth/logout with 401 when the refresh_token cookie is missing in a cross-origin request (AC-004/FR-003)', async () => {
    const login = await loginCrossOrigin();

    await request(app)
      .post('/auth/logout')
      .set('Origin', ALLOWED_ORIGIN)
      .set('Cookie', [login.csrfCookie])
      .set('X-CSRF-Token', login.csrfToken)
      .expect(401);
  });
});
