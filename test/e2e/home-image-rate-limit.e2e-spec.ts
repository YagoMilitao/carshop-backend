import request from 'supertest';
import { createApp } from '../../src/infra/server';
import {
  connectDatabase,
  disconnectDatabase,
} from '../../src/infra/database/mongoose';
import { HomeImageSettingModel } from '../../src/data/models/home-image-setting.model';
import { FakeImageStorageAdapter } from './support/fake-image-storage.adapter';

/**
 * CARSHOP-159 — AC-013 / NFR-002: `PATCH /admin/home-image` is covered by
 * the global rate limiter (100 req / 15 min) and returns the project's
 * standard 429 body once exceeded.
 *
 * Kept in its own file because `globalRateLimitMiddleware` is a
 * module-level singleton: tripping it here must not affect other specs.
 */
describe('PATCH /admin/home-image rate limiting (e2e, CARSHOP-159 AC-013)', () => {
  let app: ReturnType<typeof createApp>;

  beforeAll(async () => {
    if (!process.env.MONGO_URI) {
      throw new Error(
        'MONGO_URI não foi definida. O globalSetup do Jest deveria tê-la configurado antes dos testes.',
      );
    }

    await connectDatabase(process.env.MONGO_URI);
    await HomeImageSettingModel.deleteMany({});
  });

  afterAll(async () => {
    await disconnectDatabase();
  });

  beforeEach(() => {
    process.env.JWT_SECRET = 'e2e-secret';
    process.env.ADMIN_EMAIL = 'admin-home-image-rate-limit@carshop.com';
    process.env.ADMIN_PASSWORD = '123456';
    process.env.JWT_EXPIRES_IN = '15m';
    process.env.JWT_REFRESH_EXPIRES_IN = '7d';
    app = createApp({ imageStorage: new FakeImageStorageAdapter() });
  });

  it('returns 429 with the standard rate-limit body after 100 requests and does not change the configuration', async () => {
    const client = request(app);
    const body = {
      workId: 'cf357670-d168-48b4-a5de-c57dff7858fe',
      imageId: '0b7e4a1c-3f2d-4c5e-9a8b-1d2e3f4a5b6c',
    };

    const statuses: number[] = [];
    let lastResponse: { status: number; body: unknown } | undefined;

    for (let attempt = 1; attempt <= 101; attempt += 1) {
      lastResponse = await client.patch('/admin/home-image').send(body);
      statuses.push(lastResponse.status);
    }

    // Within the limit the request reaches authMiddleware (401).
    expect(statuses.slice(0, 100).every((status) => status === 401)).toBe(true);
    expect(lastResponse?.status).toBe(429);
    expect(lastResponse?.body).toEqual({
      message: 'Muitas requisições. Tente novamente em alguns minutos.',
    });
    await expect(HomeImageSettingModel.countDocuments()).resolves.toBe(0);
  });
});
