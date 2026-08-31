import request from 'supertest';
import { createApp } from '../../src/infra/server';
import {
  connectDatabase,
  disconnectDatabase,
} from '../../src/infra/database/mongoose';
import { AuthSessionModel } from '../../src/data/models/auth-session.model';

/**
 * CARSHOP-108 — E2E coverage for the dedicated brute-force rate limiting
 * policy on `POST /auth/login`.
 *
 * Traceability:
 * - AC-002/AC-003 (FR-003/FR-004/FR-005/NFR-001): repeated invalid-credential
 *   attempts eventually receive HTTP 429 with a static, generic message that
 *   never reveals whether the submitted email exists.
 * - AC-006 (FR-006/FR-009 boundary — "no session on 429"): the blocked 429
 *   response never sets refresh_token/csrf_token cookies and never creates a
 *   new AuthSessionModel document.
 * - AC-007 (FR-009): after the 5-minute window elapses, a legitimate login
 *   is no longer blocked and succeeds again.
 * - AC-008 (FR-008/NFR-004): a legitimate login within the allowed attempt
 *   count (3rd of 5) still returns the existing 200/AuthResponse contract.
 */

interface ErrorResponseBody {
  message: string;
}

interface AuthResponseBody {
  accessToken: string;
  sessionId: string;
  tokenType: 'Bearer';
}

const ADMIN_EMAIL = 'admin@carshop.com';
const ADMIN_PASSWORD = '123456';

/**
 * Doações de tempo: jest fake timers configurados para congelar apenas
 * `Date`/`performance`, preservando `setTimeout`/`setInterval` reais.
 *
 * Motivo:
 * `express-rate-limit`'s `MemoryStore.increment()` decides whether to reset
 * a client's counter by comparing `client.resetTime.getTime() <= Date.now()`
 * (see node_modules/express-rate-limit/dist/index.cjs), i.e. it is a lazy,
 * read-time check of `Date.now()` rather than a scheduled `setTimeout`
 * callback. Advancing only the mocked `Date` (via `jest.setSystemTime`)
 * therefore reliably simulates window expiry without needing to fake
 * `setTimeout`/`setInterval`, which would otherwise interfere with the
 * real Node.js sockets/event loop that `supertest` depends on to complete
 * HTTP requests. This was verified experimentally against the installed
 * `express-rate-limit@8.7.0` as flagged as an open question in
 * specs/CARSHOP-108/plan.md (AC-007 testing strategy).
 */
const FAKE_TIMERS_DO_NOT_FAKE: Array<
  | 'hrtime'
  | 'nextTick'
  | 'performance'
  | 'queueMicrotask'
  | 'requestAnimationFrame'
  | 'cancelAnimationFrame'
  | 'requestIdleCallback'
  | 'cancelIdleCallback'
  | 'setImmediate'
  | 'clearImmediate'
  | 'setInterval'
  | 'clearInterval'
  | 'setTimeout'
  | 'clearTimeout'
> = [
  'hrtime',
  'nextTick',
  'performance',
  'queueMicrotask',
  'requestAnimationFrame',
  'cancelAnimationFrame',
  'requestIdleCallback',
  'cancelIdleCallback',
  'setImmediate',
  'clearImmediate',
  'setInterval',
  'clearInterval',
  'setTimeout',
  'clearTimeout',
];

function extractCookie(setCookie: string[], cookieName: string) {
  const cookie = setCookie.find((entry) => entry.startsWith(`${cookieName}=`));
  return cookie?.split(';')[0];
}

function getSetCookieArray(headers: Record<string, unknown>): string[] {
  const rawSetCookie = headers['set-cookie'];
  return Array.isArray(rawSetCookie) ? rawSetCookie : rawSetCookie ? [rawSetCookie as string] : [];
}

describe('POST /auth/login dedicated brute-force rate limiting (e2e, CARSHOP-108)', () => {
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

  afterEach(() => {
    jest.useRealTimers();
  });

  // AC-002/AC-003: exceeding the dedicated limit returns 429 with a generic,
  // account-existence-agnostic body, identical for a real vs a nonexistent
  // email, and both identical to each other before the limit as well.
  it('returns 429 with a static generic message after exceeding the dedicated login limit, identical regardless of whether the email exists (AC-002/AC-003)', async () => {
    const nonexistentEmailAgent = request(app);
    const realEmailWrongPasswordAgent = request(app);

    // Distinct IPs so the two scenarios don't share the same rate-limit
    // bucket (key = IP + hashed email) and interfere with each other.
    const NONEXISTENT_IP = '10.0.0.1';
    const REAL_EMAIL_IP = '10.0.0.2';

    // Both scenarios: identical 401 shape for the first 5 (within-limit)
    // attempts — neither reveals account existence.
    let lastNonexistentBody: ErrorResponseBody | undefined;
    let lastRealEmailBody: ErrorResponseBody | undefined;

    for (let attempt = 1; attempt <= 5; attempt += 1) {
      const nonexistentResponse = await nonexistentEmailAgent
        .post('/auth/login')
        .set('X-Forwarded-For', NONEXISTENT_IP)
        .send({ email: 'does-not-exist@carshop.com', password: 'whatever' })
        .expect(401);

      const realEmailResponse = await realEmailWrongPasswordAgent
        .post('/auth/login')
        .set('X-Forwarded-For', REAL_EMAIL_IP)
        .send({ email: ADMIN_EMAIL, password: 'wrong-password' })
        .expect(401);

      lastNonexistentBody = nonexistentResponse.body as ErrorResponseBody;
      lastRealEmailBody = realEmailResponse.body as ErrorResponseBody;

      expect(Object.keys(lastNonexistentBody).sort()).toEqual(
        Object.keys(lastRealEmailBody).sort(),
      );
    }

    expect(lastNonexistentBody).toBeDefined();
    expect(lastRealEmailBody).toBeDefined();

    // 6th attempt for each: now blocked by the dedicated limiter (5/5min).
    const blockedNonexistentResponse = await nonexistentEmailAgent
      .post('/auth/login')
      .set('X-Forwarded-For', NONEXISTENT_IP)
      .send({ email: 'does-not-exist@carshop.com', password: 'whatever' })
      .expect(429);

    const blockedRealEmailResponse = await realEmailWrongPasswordAgent
      .post('/auth/login')
      .set('X-Forwarded-For', REAL_EMAIL_IP)
      .send({ email: ADMIN_EMAIL, password: 'wrong-password' })
      .expect(429);

    const blockedNonexistentBody =
      blockedNonexistentResponse.body as ErrorResponseBody;
    const blockedRealEmailBody =
      blockedRealEmailResponse.body as ErrorResponseBody;

    // Generic, static message — never varies with email validity.
    expect(blockedNonexistentBody.message).toBe(
      'Muitas tentativas de login. Tente novamente mais tarde.',
    );
    expect(blockedRealEmailBody.message).toBe(blockedNonexistentBody.message);

    // Body never contains the submitted email.
    expect(JSON.stringify(blockedNonexistentBody)).not.toMatch(
      /does-not-exist@carshop\.com/,
    );
    expect(JSON.stringify(blockedRealEmailBody)).not.toMatch(
      new RegExp(ADMIN_EMAIL.replace('.', '\\.')),
    );
  });

  // AC-006: no session/cookies are created on a blocked (429) response.
  it('creates no session and issues no refresh_token/csrf_token cookie on the 429 response (AC-006)', async () => {
    const BLOCKED_IP = '10.0.0.3';
    const agent = request(app);

    for (let attempt = 1; attempt <= 5; attempt += 1) {
      await agent
        .post('/auth/login')
        .set('X-Forwarded-For', BLOCKED_IP)
        .send({ email: ADMIN_EMAIL, password: 'wrong-password' })
        .expect(401);
    }

    const sessionCountBefore = await AuthSessionModel.countDocuments({
      email: ADMIN_EMAIL,
    });

    const blockedResponse = await agent
      .post('/auth/login')
      .set('X-Forwarded-For', BLOCKED_IP)
      .send({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD })
      .expect(429);

    const sessionCountAfter = await AuthSessionModel.countDocuments({
      email: ADMIN_EMAIL,
    });

    const setCookie = getSetCookieArray(
      blockedResponse.headers as Record<string, unknown>,
    );

    expect(extractCookie(setCookie, 'refresh_token')).toBeUndefined();
    expect(extractCookie(setCookie, 'csrf_token')).toBeUndefined();
    expect(sessionCountAfter).toBe(sessionCountBefore);
  });

  // AC-008/NFR-004: a legitimate login within the allowed attempt count
  // (3rd of 5) still returns the existing 200/AuthResponse contract.
  it('still allows a legitimate login within the allowed attempt count, preserving the existing 200 contract (AC-008)', async () => {
    const LEGITIMATE_IP = '10.0.0.4';
    const agent = request(app);

    // 2 failed attempts (well within the 5-attempt budget).
    await agent
      .post('/auth/login')
      .set('X-Forwarded-For', LEGITIMATE_IP)
      .send({ email: ADMIN_EMAIL, password: 'wrong-1' })
      .expect(401);

    await agent
      .post('/auth/login')
      .set('X-Forwarded-For', LEGITIMATE_IP)
      .send({ email: ADMIN_EMAIL, password: 'wrong-2' })
      .expect(401);

    // 3rd attempt: correct credentials, still within the 5-attempt window.
    const loginResponse = await agent
      .post('/auth/login')
      .set('X-Forwarded-For', LEGITIMATE_IP)
      .send({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD })
      .expect(200);

    const loginBody = loginResponse.body as AuthResponseBody;

    expect(loginBody.accessToken).toBeDefined();
    expect(loginBody.tokenType).toBe('Bearer');
    expect(loginBody.sessionId).toBeDefined();

    const setCookie = getSetCookieArray(
      loginResponse.headers as Record<string, unknown>,
    );

    expect(extractCookie(setCookie, 'refresh_token')).toBeDefined();
    expect(extractCookie(setCookie, 'csrf_token')).toBeDefined();
  });

  // AC-007/FR-009: after the dedicated limiter's 5-minute window elapses,
  // a previously blocked client can log in again normally.
  it('allows login again after the dedicated limiter window elapses (AC-007)', async () => {
    const RECOVERY_IP = '10.0.0.5';
    const agent = request(app);

    for (let attempt = 1; attempt <= 5; attempt += 1) {
      await agent
        .post('/auth/login')
        .set('X-Forwarded-For', RECOVERY_IP)
        .send({ email: ADMIN_EMAIL, password: 'wrong-password' })
        .expect(401);
    }

    await agent
      .post('/auth/login')
      .set('X-Forwarded-For', RECOVERY_IP)
      .send({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD })
      .expect(429);

    // Capture the target epoch (in real time) before installing fake
    // timers: once `Date` is faked, constructing a new `Date` from
    // `Date.now()` confuses @sinonjs/fake-timers's internal epoch
    // resolution. Advance only Date/performance past the 5-minute window;
    // leave setTimeout/setInterval (and therefore supertest's sockets)
    // real.
    const futureEpochMs = Date.now() + 5 * 60 * 1000 + 1000;
    jest.useFakeTimers({ doNotFake: FAKE_TIMERS_DO_NOT_FAKE });
    jest.setSystemTime(futureEpochMs);

    const recoveredResponse = await agent
      .post('/auth/login')
      .set('X-Forwarded-For', RECOVERY_IP)
      .send({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD })
      .expect(200);

    const recoveredBody = recoveredResponse.body as AuthResponseBody;

    expect(recoveredBody.accessToken).toBeDefined();
    expect(recoveredBody.tokenType).toBe('Bearer');
  });

  // AC-009/FR-010 (no automated test added here — see the tester's final
  // report for the reasoning): blocking must never log credential values.
  // `loginRateLimitMiddleware` registers no custom `handler`/
  // `onLimitReached` callback (verified by reading
  // src/infra/presentation/middleware/rate-limit.middleware.ts), and the
  // app's only HTTP access logger (`morgan`, registered in
  // src/infra/config/middleware.ts) never logs the request body or
  // Set-Cookie/Authorization header values. Because no credential value
  // ever reaches a log call in the first place, there is no runtime
  // behavior left to assert beyond what AC-002/AC-003 (generic 429 body)
  // and AC-006 (no cookies on 429) already exercise; asserting "logger was
  // never called with a password" would be a coverage-gaming assertion
  // against a call site that structurally does not exist.
});
