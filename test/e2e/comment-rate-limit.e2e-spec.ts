import request from 'supertest';
import { createApp } from '../../src/infra/server';
import {
  connectDatabase,
  disconnectDatabase,
} from '../../src/infra/database/mongoose';
import { FakeImageStorageAdapter } from './support/fake-image-storage.adapter';

/**
 * CARSHOP-17 — E2E coverage for the dedicated rate limiting policy on
 * `POST /works/:workId/comments`.
 *
 * Traceability:
 * - AC-001 (FR-001/FR-002/FR-003/FR-004): exceeding the dedicated limit
 *   (10 requests / 10 minutes per IP) returns HTTP 429 with an error body.
 * - AC-002 (NFR-001): requests within the configured limit are processed
 *   normally (no 429).
 * - AC-003 (FR-005): the dedicated comment limiter does not affect
 *   `GET /works/:workId/comments`.
 */

interface AuthResponseBody {
  accessToken: string;
  sessionId: string;
  tokenType: 'Bearer';
}

interface WorkResponseBody {
  id: string;
  slug: string;
}

interface ErrorResponseBody {
  message: string;
}

async function loginAsAdmin(
  app: ReturnType<typeof createApp>,
): Promise<string> {
  const loginResponse = await request(app)
    .post('/auth/login')
    .send({ email: 'admin@carshop.com', password: '123456' })
    .expect(200);
  const loginBody = loginResponse.body as AuthResponseBody;

  return loginBody.accessToken;
}

async function createWork(
  app: ReturnType<typeof createApp>,
  accessToken: string,
  slug: string,
): Promise<string> {
  const response = await request(app)
    .post('/works')
    .set('Authorization', `Bearer ${accessToken}`)
    .send({
      slug,
      title: 'Reforma usada para testar rate limit de comentários',
      description: 'Reforma completa usada para testar rate limit.',
      category: 'bancos',
      tags: ['couro'],
      status: 'published',
    })
    .expect(201);

  const work = response.body as WorkResponseBody;

  return work.id;
}

describe('POST /works/:workId/comments dedicated rate limiting (e2e, CARSHOP-17)', () => {
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
    app = createApp({ imageStorage: new FakeImageStorageAdapter() });
  });

  it('processes up to the configured limit normally and returns 429 with an error body once exceeded (AC-001/AC-002)', async () => {
    const accessToken = await loginAsAdmin(app);
    const workId = await createWork(
      app,
      accessToken,
      `comment-rate-limit-${Date.now()}`,
    );
    const agent = request(app);

    // Within the dedicated limit (10 requests / 10 minutes): every request
    // is processed normally (no 429).
    for (let attempt = 1; attempt <= 10; attempt += 1) {
      await agent
        .post(`/works/${workId}/comments`)
        .send({
          authorName: `Cliente ${attempt}`,
          content: `Comentário número ${attempt}.`,
        })
        .expect(201);
    }

    // 11th request from the same IP within the window: blocked.
    const blockedResponse = await agent
      .post(`/works/${workId}/comments`)
      .send({ authorName: 'Cliente Bloqueado', content: 'Mais um comentário.' })
      .expect(429);

    const blockedBody = blockedResponse.body as ErrorResponseBody;

    expect(blockedBody.message).toBe(
      'Muitas tentativas de comentário. Tente novamente em alguns minutos.',
    );
  });

  it('does not affect GET /works/:workId/comments once the dedicated comment limiter is exhausted (AC-003)', async () => {
    const accessToken = await loginAsAdmin(app);
    const workId = await createWork(
      app,
      accessToken,
      `comment-rate-limit-read-${Date.now()}`,
    );
    const agent = request(app);

    for (let attempt = 1; attempt <= 10; attempt += 1) {
      await agent
        .post(`/works/${workId}/comments`)
        .send({
          authorName: `Cliente ${attempt}`,
          content: `Comentário número ${attempt}.`,
        })
        .expect(201);
    }

    // Dedicated comment limiter is now exhausted for this IP.
    await agent
      .post(`/works/${workId}/comments`)
      .send({ authorName: 'Cliente Bloqueado', content: 'Mais um comentário.' })
      .expect(429);

    // The read-only listing route is unaffected by the dedicated limiter.
    await agent.get(`/works/${workId}/comments`).expect(200);
  });
});
