import request from 'supertest';
import { createApp } from '../../src/infra/server';
import {
  connectDatabase,
  disconnectDatabase,
} from '../../src/infra/database/mongoose';

/**
 * CARSHOP-111 — E2E coverage for Helmet-provided security headers on the
 * actually assembled application.
 *
 * Traceability:
 * - FR-001/AC-001: responses from the assembled app include the expected
 *   Helmet security headers and do not expose the `X-Powered-By` header.
 */
describe('Global security headers (e2e, CARSHOP-111)', () => {
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

  it('does not expose the X-Powered-By header (FR-001/AC-001)', async () => {
    const response = await request(app).get('/').expect(200);

    expect(response.headers['x-powered-by']).toBeUndefined();
  });

  it('includes the expected Helmet default security headers (FR-001/AC-001)', async () => {
    const response = await request(app).get('/').expect(200);

    // Verified against the installed helmet@8.1.0 default header set.
    expect(response.headers['x-content-type-options']).toBe('nosniff');
    expect(response.headers['x-frame-options']).toBe('SAMEORIGIN');
    expect(response.headers['x-dns-prefetch-control']).toBe('off');
    expect(response.headers['x-download-options']).toBe('noopen');
    expect(response.headers['strict-transport-security']).toBe(
      'max-age=31536000; includeSubDomains',
    );
    expect(response.headers['content-security-policy']).toEqual(
      expect.stringContaining("default-src 'self'"),
    );
    expect(response.headers['cross-origin-opener-policy']).toBe('same-origin');
    expect(response.headers['cross-origin-resource-policy']).toBe(
      'same-origin',
    );
    expect(response.headers['origin-agent-cluster']).toBe('?1');
    expect(response.headers['referrer-policy']).toBe('no-referrer');
  });

  it('applies the same header set to an error response (404) (FR-001/AC-001)', async () => {
    const response = await request(app).get('/route-that-does-not-exist').expect(404);

    expect(response.headers['x-powered-by']).toBeUndefined();
    expect(response.headers['x-content-type-options']).toBe('nosniff');
  });
});
