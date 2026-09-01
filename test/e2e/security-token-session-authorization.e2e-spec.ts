import request from 'supertest';
import { createApp } from '../../src/infra/server';
import {
  connectDatabase,
  disconnectDatabase,
} from '../../src/infra/database/mongoose';
import { AuthSessionModel } from '../../src/data/models/auth-session.model';
import { loginAsAdmin } from './support/security-test.helpers';
import { advanceSystemTimeTo } from './support/fake-clock.helper';

const ADMIN_EMAIL = 'admin@carshop.com';
const ADMIN_PASSWORD = '123456';

/**
 * CARSHOP-111 — E2E coverage for token/session authorization rejection
 * paths on an authenticated route (`GET /auth/session`).
 *
 * Traceability:
 * - FR-009/AC-005: a tampered (invalid-signature) access token is
 *   rejected with 401.
 * - FR-010/AC-005: a valid refresh token used as an access token is
 *   rejected with 401.
 * - FR-011/AC-005: a token bound to a revoked session is rejected with
 *   401.
 * - FR-012/AC-005: an expired access token is rejected with 401.
 */
describe('Token and session authorization (e2e, CARSHOP-111)', () => {
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
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('rejects a tampered access token with a mutated signature segment with 401 (FR-009/AC-005)', async () => {
    app = createApp();

    const login = await loginAsAdmin(app, ADMIN_EMAIL, ADMIN_PASSWORD);
    const segments = login.accessToken.split('.');
    const signatureSegment = segments[2] ?? '';
    const mutatedFirstChar = signatureSegment.startsWith('a') ? 'b' : 'a';
    const tamperedToken = [
      segments[0],
      segments[1],
      mutatedFirstChar + signatureSegment.slice(1),
    ].join('.');

    await request(app)
      .get('/auth/session')
      .set('Authorization', `Bearer ${tamperedToken}`)
      .expect(401);
  });

  it('rejects a valid refresh token used as an access token with 401 (FR-010/AC-005)', async () => {
    app = createApp();

    const login = await loginAsAdmin(app, ADMIN_EMAIL, ADMIN_PASSWORD);
    const refreshTokenValue = login.refreshCookie.split('=').slice(1).join('=');

    await request(app)
      .get('/auth/session')
      .set('Authorization', `Bearer ${refreshTokenValue}`)
      .expect(401);
  });

  it('rejects a token bound to a session revoked directly in persistence with 401 (FR-011/AC-005)', async () => {
    app = createApp();

    const login = await loginAsAdmin(app, ADMIN_EMAIL, ADMIN_PASSWORD);

    await request(app)
      .get('/auth/session')
      .set('Authorization', `Bearer ${login.accessToken}`)
      .expect(200);

    // Mirrors MongoSessionStoreRepository.revoke()'s own update shape.
    await AuthSessionModel.findOneAndUpdate(
      { id: login.sessionId },
      { revokedAt: Date.now() },
    );

    await request(app)
      .get('/auth/session')
      .set('Authorization', `Bearer ${login.accessToken}`)
      .expect(401);
  });

  it('rejects an expired access token with 401 (FR-012/AC-005)', async () => {
    process.env.JWT_EXPIRES_IN = '5s';
    app = createApp();

    const login = await loginAsAdmin(app, ADMIN_EMAIL, ADMIN_PASSWORD);

    const futureEpochMs = Date.now() + 5 * 1000 + 1000;
    advanceSystemTimeTo(futureEpochMs);

    await request(app)
      .get('/auth/session')
      .set('Authorization', `Bearer ${login.accessToken}`)
      .expect(401);
  });
});
