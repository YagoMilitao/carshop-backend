import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from './../src/app.module';

function extractCookie(setCookie: string[], cookieName: string) {
  const cookie = setCookie.find((entry) => entry.startsWith(`${cookieName}=`));
  return cookie?.split(';')[0];
}

describe('Auth flow (e2e)', () => {
  let app: INestApplication;

  beforeEach(async () => {
    process.env.JWT_SECRET = 'e2e-secret';
    process.env.ADMIN_EMAIL = 'admin@carshop.com';
    process.env.ADMIN_PASSWORD = '123456';
    process.env.JWT_EXPIRES_IN = '15m';
    process.env.JWT_REFRESH_EXPIRES_IN = '7d';

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );

    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  it('performs login, refresh, protected session access, and logout', async () => {
    const loginResponse = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: 'admin@carshop.com', password: '123456' })
      .expect(201);

    expect(loginResponse.body.accessToken).toBeDefined();

    const setCookie = loginResponse.headers['set-cookie'] as string[];
    const refreshCookie = extractCookie(setCookie, 'refresh_token');
    const csrfCookie = extractCookie(setCookie, 'csrf_token');
    const csrfToken = csrfCookie?.split('=')[1];

    expect(refreshCookie).toBeDefined();
    expect(csrfCookie).toBeDefined();

    await request(app.getHttpServer())
      .get('/auth/session')
      .set('Authorization', `Bearer ${loginResponse.body.accessToken}`)
      .expect(200)
      .expect(({ body }) => {
        expect(body.email).toBe('admin@carshop.com');
        expect(body.sessionId).toBe(loginResponse.body.sessionId);
      });

    await request(app.getHttpServer())
      .post('/auth/refresh')
      .set('Cookie', [refreshCookie!, csrfCookie!])
      .expect(403);

    const refreshResponse = await request(app.getHttpServer())
      .post('/auth/refresh')
      .set('Cookie', [refreshCookie!, csrfCookie!])
      .set('X-CSRF-Token', csrfToken!)
      .expect(201);

    expect(refreshResponse.body.accessToken).toBeDefined();
    expect(refreshResponse.body.accessToken).not.toBe(loginResponse.body.accessToken);

    const rotatedCookies = refreshResponse.headers['set-cookie'] as string[];
    const rotatedRefreshCookie = extractCookie(rotatedCookies, 'refresh_token');
    const rotatedCsrfCookie = extractCookie(rotatedCookies, 'csrf_token');
    const rotatedCsrfToken = rotatedCsrfCookie?.split('=')[1];

    await request(app.getHttpServer())
      .post('/auth/logout')
      .set('Cookie', [rotatedRefreshCookie!, rotatedCsrfCookie!])
      .set('X-CSRF-Token', rotatedCsrfToken!)
      .expect(201)
      .expect({ success: true });

    await request(app.getHttpServer())
      .get('/auth/session')
      .set('Authorization', `Bearer ${refreshResponse.body.accessToken}`)
      .expect(401);
  });
});
