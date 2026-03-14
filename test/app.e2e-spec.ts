/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';

describe('Auth (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('login -> refresh -> logout', async () => {
    // LOGIN
    const login = await request(app.getHttpServer())
      .post('/auth/login')
      .send({
        email: process.env.ADMIN_EMAIL,
        password: process.env.ADMIN_PASSWORD,
      })
      .expect(201);

    expect(login.body.accessToken).toBeDefined();
    expect(login.body.csrfToken).toBeDefined();

    const cookies = login.headers['set-cookie'];
    expect(cookies).toBeDefined();

    // REFRESH (precisa mandar cookies + header CSRF)
    const csrfToken = login.body.csrfToken;

    const refresh = await request(app.getHttpServer())
      .post('/auth/refresh')
      .set('Cookie', cookies)
      .set('x-csrf-token', csrfToken)
      .expect(201);

    expect(refresh.body.accessToken).toBeDefined();
    expect(refresh.body.csrfToken).toBeDefined();

    const refreshCookies = refresh.headers['set-cookie'];

    // LOGOUT
    await request(app.getHttpServer())
      .post('/auth/logout')
      .set('Cookie', refreshCookies ?? cookies)
      .set('x-csrf-token', refresh.body.csrfToken)
      .expect(201);
  });
});
