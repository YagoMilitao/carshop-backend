import request from 'supertest';
import type { createApp as CreateAppType } from '../../src/infra/server';
import {
  connectDatabase,
  disconnectDatabase,
} from '../../src/infra/database/mongoose';

/**
 * CARSHOP-111 — E2E coverage for CORS allow/deny behavior on the actually
 * assembled application.
 *
 * Traceability:
 * - FR-002/FR-003/AC-002: a request from an allowed origin receives correct
 *   CORS authorization; a request from a disallowed origin does not.
 *
 * Observation (not a defect, out of scope to "fix" per spec.md Out of
 * Scope / plan.md Technical Decisions): the current `buildCorsOptions()`
 * origin callback invokes `callback(new Error(...))` for a disallowed
 * origin. Per `node_modules/cors/lib/index.js`, this causes the `cors`
 * middleware to call `next(err)` with a plain `Error` that is neither an
 * `HttpError` nor a `SyntaxError`, so `errorHandlerMiddleware`'s generic
 * branch fires: HTTP 500, `{ message: 'Erro interno no servidor.' }`, no
 * `Access-Control-Allow-Origin` header. This suite documents that actual
 * behavior rather than an assumed "more correct" 403.
 *
 * Test-infrastructure note (why this file uses `jest.isolateModules`
 * instead of the plain `beforeEach` + static `import` pattern used by
 * sibling files): `src/infra/config/env.ts` computes `env.corsOrigins`
 * once, eagerly, as part of the module-level `export const env = {...}`,
 * the moment the module is first imported — unlike `ADMIN_EMAIL`/
 * `ADMIN_PASSWORD` (`EnvAdminCredentialsProvider` reads `process.env`
 * live on every call) and `JWT_SECRET`/`JWT_EXPIRES_IN`
 * (`src/infra/constants/auth.constants.ts` reads `process.env` live).
 * Because a static top-level `import` is resolved before any
 * `beforeEach` runs, setting `process.env.CORS_ORIGIN` in `beforeEach`
 * has no effect on an already-imported `createApp`. This suite instead
 * sets `CORS_ORIGIN` and then loads a fresh module graph via
 * `jest.isolateModules`/`require`, mirroring the exact pattern already
 * used by `test/unit/infra/config/env.spec.ts` for the same class of
 * problem (dynamically reconfiguring an eagerly-computed `env` value per
 * scenario).
 */
describe('CORS policy (e2e, CARSHOP-111)', () => {
  let app: ReturnType<typeof CreateAppType>;

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

  function buildAppWithCorsOrigin(corsOrigin: string): ReturnType<typeof CreateAppType> {
    process.env.JWT_SECRET = 'e2e-secret';
    process.env.ADMIN_EMAIL = 'admin@carshop.com';
    process.env.ADMIN_PASSWORD = '123456';
    process.env.JWT_EXPIRES_IN = '15m';
    process.env.JWT_REFRESH_EXPIRES_IN = '7d';
    process.env.CORS_ORIGIN = corsOrigin;

    let freshApp: ReturnType<typeof CreateAppType> | undefined;

    jest.isolateModules(() => {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const freshServerModule = require('../../src/infra/server') as {
        createApp: typeof CreateAppType;
      };
      freshApp = freshServerModule.createApp();
    });

    if (!freshApp) {
      throw new Error(
        'buildAppWithCorsOrigin: falha ao construir a aplicação com CORS_ORIGIN isolado.',
      );
    }

    return freshApp;
  }

  afterEach(() => {
    delete process.env.CORS_ORIGIN;
  });

  it('grants CORS authorization to a request from an allowed origin (FR-002/AC-002)', async () => {
    app = buildAppWithCorsOrigin('https://allowed.e2e.test');

    const response = await request(app)
      .get('/')
      .set('Origin', 'https://allowed.e2e.test')
      .expect(200);

    expect(response.headers['access-control-allow-origin']).toBe(
      'https://allowed.e2e.test',
    );
    expect(response.headers['access-control-allow-credentials']).toBe('true');
  });

  it('does not grant CORS authorization to a request from a disallowed origin (FR-003/AC-002)', async () => {
    app = buildAppWithCorsOrigin('https://allowed.e2e.test');

    const response = await request(app)
      .get('/')
      .set('Origin', 'https://blocked.e2e.test');

    // Documents actual current behavior (see file-level comment above):
    // the cors package's origin-callback error reaches the generic 500
    // error-handler branch, never issuing CORS authorization headers.
    expect(response.status).toBe(500);
    expect(response.headers['access-control-allow-origin']).toBeUndefined();
    expect(response.body).toEqual({ message: 'Erro interno no servidor.' });
  });

  it('allows a request with no Origin header regardless of the allow-list (FR-002/AC-002)', async () => {
    app = buildAppWithCorsOrigin('https://allowed.e2e.test');

    const response = await request(app).get('/').expect(200);

    expect(response.text).toBe('Hello World!');
  });
});
