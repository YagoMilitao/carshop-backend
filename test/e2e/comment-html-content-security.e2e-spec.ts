import request from 'supertest';
import { createApp } from '../../src/infra/server';
import {
  connectDatabase,
  disconnectDatabase,
} from '../../src/infra/database/mongoose';
import { FakeImageStorageAdapter } from './support/fake-image-storage.adapter';

interface AuthResponseBody {
  accessToken: string;
  sessionId: string;
  tokenType: 'Bearer';
}

interface WorkResponseBody {
  id: string;
  slug: string;
}

interface CommentResponseBody {
  id: string;
  workId: string;
  authorName: string;
  content: string;
  status: 'PENDING' | 'APPROVED';
}

// This file's own dedicated login rate-limit bucket (module-scoped
// singleton limiter, isolated per Jest test file): keep total
// successful+failed login calls at or below 5.
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
      title: 'Reforma de bancos para teste de conteúdo HTML em comentário',
      description:
        'Reforma completa usada para testar rejeição de markup HTML/script em comentários.',
      category: 'bancos',
      tags: ['couro'],
      status: 'published',
    })
    .expect(201);

  const work = response.body as WorkResponseBody;

  return work.id;
}

/**
 * CARSHOP-16 — FR-001–FR-005, NFR-001–NFR-003 / AC-001, AC-005, AC-007:
 * cobertura E2E confirmando que `POST /works/:workId/comments` rejeita
 * payloads de ataque HTML/script com 4xx sem persistir o comentário, e
 * que continua aceitando submissões de texto plano legítimas.
 */
describe('Comment creation HTML/script content security (e2e)', () => {
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

  it('rejects a script-tag attack payload in content with 4xx and does not persist or list the comment (AC-001/AC-007)', async () => {
    const accessToken = await loginAsAdmin(app);
    const workId = await createWork(
      app,
      accessToken,
      `comment-html-attack-${Date.now()}`,
    );

    await request(app)
      .post(`/works/${workId}/comments`)
      .send({
        authorName: 'Atacante Teste',
        content: '<script>alert(1)</script>',
      })
      .expect((response) => {
        if (response.status < 400 || response.status >= 500) {
          throw new Error(
            `Expected a 4xx status, received ${response.status}`,
          );
        }
      });

    // Approve nothing was ever created: the "pending" comment must not
    // exist, and it also must never surface via the approved-comments
    // listing endpoint (AC-007).
    const listResponse = await request(app)
      .get(`/works/${workId}/comments`)
      .expect(200);
    const comments = listResponse.body as CommentResponseBody[];

    expect(
      comments.some((comment) => comment.content.includes('<script>')),
    ).toBe(false);
    expect(comments).toHaveLength(0);
  });

  it('accepts a plain-text comment payload with no markup and persists it exactly as submitted (AC-005)', async () => {
    const accessToken = await loginAsAdmin(app);
    const workId = await createWork(
      app,
      accessToken,
      `comment-html-plain-${Date.now()}`,
    );

    const createResponse = await request(app)
      .post(`/works/${workId}/comments`)
      .send({
        authorName: 'Maria Silva',
        content: 'Ótimo trabalho, ficou excelente!',
      })
      .expect(201);

    const comment = createResponse.body as CommentResponseBody;

    expect(comment.workId).toBe(workId);
    expect(comment.authorName).toBe('Maria Silva');
    expect(comment.content).toBe('Ótimo trabalho, ficou excelente!');
    expect(comment.status).toBe('PENDING');
  });
});
