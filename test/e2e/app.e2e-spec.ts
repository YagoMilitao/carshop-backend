import request from 'supertest';
import { createApp } from '../../src/infra/server';
import {
  connectDatabase,
  disconnectDatabase,
} from '../../src/infra/database/mongoose';
import { AuthSessionModel } from '../../src/data/models/auth-session.model';

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

function extractCookie(setCookie: string[], cookieName: string) {
  const cookie = setCookie.find((entry) => entry.startsWith(`${cookieName}=`));
  return cookie?.split(';')[0];
}

describe('Auth flow (e2e)', () => {
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
    process.env.ADMIN_EMAIL = 'admin@carshop.com';
    process.env.ADMIN_PASSWORD = '123456';
    process.env.JWT_EXPIRES_IN = '15m';
    process.env.JWT_REFRESH_EXPIRES_IN = '7d';
    app = createApp();
  });

  it('performs login, refresh, protected session access, and logout', async () => {
    const loginResponse = await request(app)
      .post('/auth/login')
      .send({ email: 'admin@carshop.com', password: '123456' })
      .expect(200);
    const loginBody = loginResponse.body as AuthResponseBody;

    expect(loginBody.accessToken).toBeDefined();

    const rawSetCookie = loginResponse.headers['set-cookie'];
    const setCookie = Array.isArray(rawSetCookie)
      ? rawSetCookie
      : rawSetCookie
        ? [rawSetCookie]
        : [];
    const refreshCookie = extractCookie(setCookie, 'refresh_token');
    const csrfCookie = extractCookie(setCookie, 'csrf_token');
    const csrfToken = csrfCookie?.split('=')[1];

    expect(refreshCookie).toBeDefined();
    expect(csrfCookie).toBeDefined();

    const sessionResponse = await request(app)
      .get('/auth/session')
      .set('Authorization', `Bearer ${loginBody.accessToken}`)
      .expect(200);
    const sessionBody = sessionResponse.body as SessionResponseBody;

    expect(sessionBody.email).toBe('admin@carshop.com');
    expect(sessionBody.sessionId).toBe(loginBody.sessionId);

    await request(app)
      .post('/auth/refresh')
      .set('Cookie', [refreshCookie!, csrfCookie!])
      .expect(403);

    const refreshResponse = await request(app)
      .post('/auth/refresh')
      .set('Cookie', [refreshCookie!, csrfCookie!])
      .set('X-CSRF-Token', csrfToken!)
      .expect(200);
    const refreshBody = refreshResponse.body as AuthResponseBody;

    expect(refreshBody.accessToken).toBeDefined();
    expect(refreshBody.accessToken).not.toBe(loginBody.accessToken);

    const rawRotatedCookies = refreshResponse.headers['set-cookie'];
    const rotatedCookies = Array.isArray(rawRotatedCookies)
      ? rawRotatedCookies
      : rawRotatedCookies
        ? [rawRotatedCookies]
        : [];
    const rotatedRefreshCookie = extractCookie(rotatedCookies, 'refresh_token');
    const rotatedCsrfCookie = extractCookie(rotatedCookies, 'csrf_token');
    const rotatedCsrfToken = rotatedCsrfCookie?.split('=')[1];

    await request(app)
      .post('/auth/logout')
      .set('Cookie', [rotatedRefreshCookie!, rotatedCsrfCookie!])
      .set('X-CSRF-Token', rotatedCsrfToken!)
      .expect(200)
      .expect({ success: true });

    await request(app)
      .get('/auth/session')
      .set('Authorization', `Bearer ${refreshBody.accessToken}`)
      .expect(401);
  });

  // CARSHOP-103 Addendum A — FR-A03/AC-A03: a wrong-password login attempt
  // must be rejected with the correct status and must not issue any
  // refresh_token/csrf_token cookie or session.
  //
  // CARSHOP-104 — FR-002/AC-001/AC-005: `errorHandlerMiddleware` now has the
  // arity Express requires to be recognized as an error handler, so this
  // request receives the intended JSON `{ message, details }` error body
  // instead of Express's default HTML error page.
  it('rejects login with an incorrect password without persisting a session or issuing cookies (FR-A03/AC-A03)', async () => {
    const sessionCountBefore = await AuthSessionModel.countDocuments({
      email: 'admin@carshop.com',
    });

    const loginResponse = await request(app)
      .post('/auth/login')
      .send({ email: 'admin@carshop.com', password: 'wrong-password' })
      .expect(401)
      .expect('Content-Type', /json/);

    expect(loginResponse.body).toHaveProperty('message');
    expect(typeof loginResponse.body.message).toBe('string');
    expect(loginResponse.text).not.toMatch(/<html/i);

    const sessionCountAfter = await AuthSessionModel.countDocuments({
      email: 'admin@carshop.com',
    });

    const rawSetCookie = loginResponse.headers['set-cookie'];
    const setCookie = Array.isArray(rawSetCookie)
      ? rawSetCookie
      : rawSetCookie
        ? [rawSetCookie]
        : [];

    expect(extractCookie(setCookie, 'refresh_token')).toBeUndefined();
    expect(extractCookie(setCookie, 'csrf_token')).toBeUndefined();
    expect(sessionCountAfter).toBe(sessionCountBefore);
  });
});

/**
 * CARSHOP-103 Addendum A — FR-A01/AC-A01: the plain-text health-check
 * endpoint at `GET /` must remain reachable and return its documented
 * shape.
 */
describe('Health check (e2e)', () => {
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
    process.env.ADMIN_EMAIL = 'admin@carshop.com';
    process.env.ADMIN_PASSWORD = '123456';
    process.env.JWT_EXPIRES_IN = '15m';
    process.env.JWT_REFRESH_EXPIRES_IN = '7d';
    app = createApp();
  });

  it('returns 200 with the plain-text "Hello World!" body (FR-A01/AC-A01)', async () => {
    const response = await request(app).get('/').expect(200);

    expect(response.text).toBe('Hello World!');
  });
});

/**
 * CARSHOP-103 Addendum A — FR-A02/AC-A02: the assembled OpenAPI document
 * must be served at `GET /docs.json` when Swagger is explicitly enabled
 * for the app instance, independent of the ambient NODE_ENV default.
 */
describe('OpenAPI document (e2e)', () => {
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
    process.env.ADMIN_EMAIL = 'admin@carshop.com';
    process.env.ADMIN_PASSWORD = '123456';
    process.env.JWT_EXPIRES_IN = '15m';
    process.env.JWT_REFRESH_EXPIRES_IN = '7d';
    process.env.ENABLE_SWAGGER = 'true';
    app = createApp();
  });

  afterEach(() => {
    delete process.env.ENABLE_SWAGGER;
  });

  it('returns 200 with a valid OpenAPI JSON document (FR-A02/AC-A02)', async () => {
    const response = await request(app).get('/docs.json').expect(200);

    expect(response.type).toBe('application/json');
    expect(typeof response.body).toBe('object');
    expect(response.body).toHaveProperty('openapi');
    expect(response.body).toHaveProperty('paths');
  });
});
