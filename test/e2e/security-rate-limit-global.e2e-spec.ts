import request from 'supertest';
import { createApp } from '../../src/infra/server';
import {
  connectDatabase,
  disconnectDatabase,
} from '../../src/infra/database/mongoose';

/**
 * CARSHOP-111 — E2E coverage for the GLOBAL rate limiter
 * (`globalRateLimitMiddleware`, 100 req / 15 min), exercised via `GET /`.
 *
 * Traceability:
 * - FR-014/AC-007: rate-limited responses include the application's
 *   standard rate-limit response headers.
 * - FR-015/AC-007: exceeding the configured rate-limit policy results in
 *   an HTTP 429 response.
 *
 * Non-duplication (NFR-004): this file targets ONLY the global limiter.
 * The dedicated login rate limiter (`loginRateLimitMiddleware`, 5/5min)
 * is already fully covered by `test/e2e/auth-login-rate-limit.e2e-spec.ts`
 * (CARSHOP-108) and is intentionally not re-tested here.
 */
describe('Global rate limiter (e2e, CARSHOP-111)', () => {
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

  // Ordered first (within this file): once the global limiter's counter
  // is tripped by the 429 scenario below, every subsequent request in
  // this same file/module registry would also receive 429, since
  // `globalRateLimitMiddleware` is a module-level singleton whose state
  // persists across `it` blocks within one Jest module instance.
  it('includes the standard RateLimit-* headers on a normal response (FR-014/AC-007)', async () => {
    const response = await request(app).get('/').expect(200);

    expect(response.headers['ratelimit-limit']).toBeDefined();
    expect(response.headers['ratelimit-remaining']).toBeDefined();
    expect(response.headers['ratelimit-reset']).toBeDefined();
    expect(response.headers['ratelimit-policy']).toContain('100');
  });

  it('returns 429 with the configured message and RateLimit-* headers after exceeding 100 requests in the window (FR-015/AC-007)', async () => {
    // RFC 5737 TEST-NET-2 — reserved for documentation/example use, never a
    // real routable address (avoids SonarQube's hardcoded-IP hotspot
    // S1313), unique to this file's own module registry.
    const RATE_LIMIT_IP = '198.51.100.202';

    let lastResponse:
      | { body: unknown; status: number; headers: Record<string, unknown> }
      | undefined;
    for (let attempt = 1; attempt <= 101; attempt += 1) {
      lastResponse = await request(app)
        .get('/')
        .set('X-Forwarded-For', RATE_LIMIT_IP);
    }

    expect(lastResponse?.status).toBe(429);
    expect(lastResponse?.body).toEqual({
      message: 'Muitas requisições. Tente novamente em alguns minutos.',
    });
    expect(lastResponse?.headers['ratelimit-limit']).toBeDefined();
    expect(lastResponse?.headers['ratelimit-remaining']).toBeDefined();
    expect(lastResponse?.headers['ratelimit-reset']).toBeDefined();
  });
});
