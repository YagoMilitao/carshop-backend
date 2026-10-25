import request from 'supertest';
import { ipKeyGenerator } from 'express-rate-limit';
import { createApp } from '../../src/infra/server';
import {
  connectDatabase,
  disconnectDatabase,
} from '../../src/infra/database/mongoose';
import {
  commentRateLimitMiddleware,
  globalRateLimitMiddleware,
} from '../../src/infra/presentation/middleware/rate-limit.middleware';
import { CommentModel } from '../../src/data/models/comment.model';
import { FakeImageStorageAdapter } from './support/fake-image-storage.adapter';

/**
 * CARSHOP-140 — E2E coverage for the anti-automation (honeypot) protection on
 * `POST /works/:workId/comments`.
 *
 * Traceability:
 * - AC-001 (FR-001/FR-002): legitimate requests (field absent or `''`) keep
 *   the existing 201 contract and persist a PENDING comment.
 * - AC-002 (FR-003): a filled control field is rejected with
 *   `400 { message: 'Payload inválido.' }` (no `details`) and nothing is
 *   persisted.
 * - AC-003/AC-004 (FR-004): `User-Agent` alone never flips the decision.
 * - AC-005 (NFR-001): the dedicated comment limiter still returns 429 and
 *   anti-bot rejections still count in its window.
 * - AC-006 (FR-005/FR-006): malformed control values are rejected
 *   deterministically (fail-closed) without leaking internal details.
 * - AC-009 (FR-009): `/docs.json` documents the new input and the 400.
 *
 * Requests never set `X-Forwarded-For`; rate-limit keys are the loopback
 * addresses, reset before each scenario.
 */

interface AuthResponseBody {
  accessToken: string;
}

interface WorkResponseBody {
  id: string;
}

interface CommentResponseBody {
  id: string;
  workId: string;
  authorName: string;
  content: string;
  status: string;
}

const LOOPBACK_RATE_LIMIT_KEYS = [
  ipKeyGenerator('127.0.0.1'),
  ipKeyGenerator('::1'),
];

const BROWSER_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

const ANTI_BOT_REJECTION = { message: 'Payload inválido.' };

const legitimatePayload = {
  authorName: 'Maria Visitante',
  content: 'Ficou excelente o acabamento dos bancos.',
};

/**
 * Logs in once per file and reuses the access token (sessions live in Mongo,
 * so the token stays valid across `createApp` instances). This keeps the
 * suite well under the dedicated login rate limit (5 per 5 minutes), which is
 * not the subject of this file.
 */
let cachedAccessToken: string | undefined;

async function loginAsAdmin(
  app: ReturnType<typeof createApp>,
): Promise<string> {
  if (cachedAccessToken) {
    return cachedAccessToken;
  }

  const loginResponse = await request(app)
    .post('/auth/login')
    .send({ email: 'admin@carshop.com', password: '123456' })
    .expect(200);

  cachedAccessToken = (loginResponse.body as AuthResponseBody).accessToken;

  return cachedAccessToken;
}

async function createPublishedWork(
  app: ReturnType<typeof createApp>,
  slugPrefix: string,
): Promise<string> {
  const accessToken = await loginAsAdmin(app);
  const response = await request(app)
    .post('/works')
    .set('Authorization', `Bearer ${accessToken}`)
    .send({
      slug: `${slugPrefix}-${Date.now()}-${Math.floor(Math.random() * 1e6)}`,
      title: 'Reforma usada para testar a proteção anti-automação',
      description: 'Reforma completa usada para testar anti-automação.',
      category: 'bancos',
      tags: ['couro'],
      status: 'published',
    })
    .expect(201);

  return (response.body as WorkResponseBody).id;
}

function countComments(workId: string): Promise<number> {
  return CommentModel.countDocuments({ workId });
}

function expectNoInternalLeak(response: request.Response): void {
  const serializedBody = JSON.stringify(response.body).toLowerCase();
  const serializedHeaders = JSON.stringify(response.headers).toLowerCase();

  for (const forbidden of [
    'stack',
    'website',
    'honeypot',
    'mongo_uri',
    'jwt_secret',
    'admin_password',
    'e2e-secret',
    'mongodb://',
  ]) {
    expect(serializedBody).not.toContain(forbidden);
    expect(serializedHeaders).not.toContain(forbidden);
  }
}

describe('POST /works/:workId/comments anti-bot protection (e2e, CARSHOP-140)', () => {
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
    for (const key of LOOPBACK_RATE_LIMIT_KEYS) {
      commentRateLimitMiddleware.resetKey(key);
      globalRateLimitMiddleware.resetKey(key);
    }

    process.env.JWT_SECRET = 'e2e-secret';
    process.env.ADMIN_EMAIL = 'admin@carshop.com';
    process.env.ADMIN_PASSWORD = '123456';
    process.env.JWT_EXPIRES_IN = '15m';
    process.env.JWT_REFRESH_EXPIRES_IN = '7d';
    app = createApp({ imageStorage: new FakeImageStorageAdapter() });
  });

  it('accepts a legitimate comment without the control field or with it empty, with the same 201 shape and PENDING status (AC-001)', async () => {
    const workId = await createPublishedWork(app, 'anti-bot-accept');
    const countBefore = await countComments(workId);

    const withoutField = await request(app)
      .post(`/works/${workId}/comments`)
      .send(legitimatePayload)
      .expect(201);

    const withEmptyField = await request(app)
      .post(`/works/${workId}/comments`)
      .send({ ...legitimatePayload, website: '' })
      .expect(201);

    const withoutFieldBody = withoutField.body as CommentResponseBody;
    const withEmptyFieldBody = withEmptyField.body as CommentResponseBody;

    expect(Object.keys(withEmptyFieldBody).sort()).toEqual(
      Object.keys(withoutFieldBody).sort(),
    );
    for (const body of [withoutFieldBody, withEmptyFieldBody]) {
      expect(body).toMatchObject({
        workId,
        authorName: legitimatePayload.authorName,
        content: legitimatePayload.content,
        status: 'PENDING',
      });
      expect(body).not.toHaveProperty('website');
    }

    await expect(countComments(workId)).resolves.toBe(countBefore + 2);

    const persisted = await CommentModel.findOne({
      id: withEmptyFieldBody.id,
    }).lean();
    expect(persisted?.status).toBe('PENDING');
    expect(persisted).not.toHaveProperty('website');
  });

  it('rejects a filled control field with the generic 400 (no details) and persists nothing (AC-002)', async () => {
    const workId = await createPublishedWork(app, 'anti-bot-reject');
    const countBefore = await countComments(workId);

    const response = await request(app)
      .post(`/works/${workId}/comments`)
      .send({ ...legitimatePayload, website: 'http://spam.example.com' })
      .expect(400);

    expect(response.body).toEqual(ANTI_BOT_REJECTION);
    expect(response.body).not.toHaveProperty('details');
    await expect(countComments(workId)).resolves.toBe(countBefore);

    // The rejected comment is also not visible through the public listing.
    const listing = await request(app)
      .get(`/works/${workId}/comments`)
      .expect(200);
    expect(JSON.stringify(listing.body)).not.toContain('spam.example.com');
  });

  it.each([
    ['browser-like', BROWSER_USER_AGENT],
    ['non-browser (curl)', 'curl/8.4.0'],
    ['empty', ''],
  ])(
    'treats a legitimate request the same regardless of a %s User-Agent (AC-003)',
    async (_label, userAgent) => {
      const workId = await createPublishedWork(app, 'anti-bot-ua-accept');

      await request(app)
        .post(`/works/${workId}/comments`)
        .set('User-Agent', userAgent)
        .send({ ...legitimatePayload, website: '' })
        .expect(201);

      await expect(countComments(workId)).resolves.toBe(1);
    },
  );

  it('rejects a filled control field even with a browser-like User-Agent, while the same UA without it is accepted (AC-004)', async () => {
    const workId = await createPublishedWork(app, 'anti-bot-ua-reject');

    const rejected = await request(app)
      .post(`/works/${workId}/comments`)
      .set('User-Agent', BROWSER_USER_AGENT)
      .send({ ...legitimatePayload, website: 'https://bot.example.com' })
      .expect(400);
    expect(rejected.body).toEqual(ANTI_BOT_REJECTION);
    await expect(countComments(workId)).resolves.toBe(0);

    await request(app)
      .post(`/works/${workId}/comments`)
      .set('User-Agent', BROWSER_USER_AGENT)
      .send(legitimatePayload)
      .expect(201);
    await expect(countComments(workId)).resolves.toBe(1);
  });

  it.each([
    ['number', 0],
    ['null', null],
    ['boolean', false],
    ['object', { url: 'http://spam.example.com' }],
    ['array', ['x']],
    ['whitespace-only string', ' '],
    ['zero-width string', '\u200B'],
  ])(
    'fails closed for a malformed control value (%s) without leaking internal details (AC-006)',
    async (_label, controlValue) => {
      const workId = await createPublishedWork(app, 'anti-bot-malformed');

      const response = await request(app)
        .post(`/works/${workId}/comments`)
        .send({ ...legitimatePayload, website: controlValue })
        .expect(400);

      expect(response.body).toEqual(ANTI_BOT_REJECTION);
      expectNoInternalLeak(response);
      await expect(countComments(workId)).resolves.toBe(0);
    },
  );

  it('keeps the regular validation 400 (with details) for ordinary invalid payloads (AC-006 regression)', async () => {
    const workId = await createPublishedWork(app, 'anti-bot-validation');

    const response = await request(app)
      .post(`/works/${workId}/comments`)
      .send({ authorName: 'A', content: 'Comentário válido.', website: '' })
      .expect(400);

    const body = response.body as { message: string; details?: unknown };
    expect(body.message).toBe('Payload inválido.');
    expect(body.details).toBeDefined();
    await expect(countComments(workId)).resolves.toBe(0);
  });

  it.each([
    [
      'prototype-pollution key',
      '{"authorName":"Maria Visitante","content":"Ficou excelente o acabamento.","__proto__":{"website":"x"}}',
    ],
    [
      'case-variant control key',
      '{"authorName":"Maria Visitante","content":"Ficou excelente o acabamento.","Website":"x"}',
    ],
  ])(
    'does not accept a %s bypass attempt (adversarial)',
    async (_label, rawJson) => {
      const workId = await createPublishedWork(app, 'anti-bot-adversarial');

      const response = await request(app)
        .post(`/works/${workId}/comments`)
        .set('Content-Type', 'application/json')
        .send(rawJson)
        .expect(400);

      expect((response.body as { message: string }).message).toBe(
        'Payload inválido.',
      );
      expect(JSON.stringify(response.body)).not.toContain('stack');
      await expect(countComments(workId)).resolves.toBe(0);
    },
  );

  it('keeps the dedicated comment rate limit: anti-bot rejections count in its window and the 11th request gets the existing 429 (AC-005)', async () => {
    const workId = await createPublishedWork(app, 'anti-bot-rate-limit');
    const agent = request(app);

    for (let attempt = 1; attempt <= 10; attempt += 1) {
      await agent
        .post(`/works/${workId}/comments`)
        .send({
          ...legitimatePayload,
          website: `http://spam-${attempt}.example`,
        })
        .expect(400);
    }

    const blocked = await agent
      .post(`/works/${workId}/comments`)
      .send(legitimatePayload)
      .expect(429);

    expect((blocked.body as { message: string }).message).toBe(
      'Muitas tentativas de comentário. Tente novamente em alguns minutos.',
    );
    await expect(countComments(workId)).resolves.toBe(0);
  });

  describe('OpenAPI document (AC-009)', () => {
    beforeEach(() => {
      process.env.ENABLE_SWAGGER = 'true';
      app = createApp({ imageStorage: new FakeImageStorageAdapter() });
    });

    afterEach(() => {
      delete process.env.ENABLE_SWAGGER;
    });

    it('documents the optional control field and the 400/429 responses in /docs.json', async () => {
      const response = await request(app).get('/docs.json').expect(200);
      const document = response.body as {
        components: {
          schemas: Record<
            string,
            {
              required?: string[];
              properties: Record<string, Record<string, unknown>>;
            }
          >;
        };
        paths: Record<
          string,
          Record<string, { responses: Record<string, { description: string }> }>
        >;
      };

      const commentRequest = document.components.schemas.CommentRequest;
      expect(commentRequest.properties.website).toMatchObject({
        type: 'string',
        maxLength: 0,
      });
      expect(commentRequest.required ?? []).not.toContain('website');

      const responses =
        document.paths['/works/{workId}/comments'].post.responses;
      expect(responses['201']).toBeDefined();
      expect(responses['400'].description).toContain('Payload inválido.');
      expect(responses['429']).toBeDefined();
    });
  });
});
