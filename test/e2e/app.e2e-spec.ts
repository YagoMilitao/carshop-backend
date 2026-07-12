import request from 'supertest';
import { createApp } from '../../src/infra/server';

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
});
