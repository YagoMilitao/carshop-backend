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
      title: 'Reforma de bancos para teste de segurança de comentário',
      description:
        'Reforma completa usada para testar payloads maliciosos de atualização de comentário.',
      category: 'bancos',
      tags: ['couro'],
      status: 'published',
    })
    .expect(201);

  const work = response.body as WorkResponseBody;

  return work.id;
}

async function createComment(
  app: ReturnType<typeof createApp>,
  workId: string,
): Promise<CommentResponseBody> {
  const response = await request(app)
    .post(`/works/${workId}/comments`)
    .send({ authorName: 'Cliente Teste', content: 'Comentário original.' })
    .expect(201);

  return response.body as CommentResponseBody;
}

async function findApprovedComment(
  app: ReturnType<typeof createApp>,
  workId: string,
  commentId: string,
): Promise<CommentResponseBody | undefined> {
  const response = await request(app)
    .get(`/works/${workId}/comments`)
    .expect(200);

  const comments = response.body as CommentResponseBody[];

  return comments.find((entry) => entry.id === commentId);
}

/**
 * CARSHOP-107 — AC-007: cobertura E2E confirmando que
 * `PATCH /admin/comments/:commentId` rejeita com 400 payloads contendo
 * chave de operador Mongo, chave com ponto ou chave de prototype pollution,
 * e que nenhuma mutação é persistida no documento alvo.
 */
describe('Admin comment update security (e2e)', () => {
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

  async function setupApprovedComment(): Promise<{
    accessToken: string;
    workId: string;
    comment: CommentResponseBody;
  }> {
    const accessToken = await loginAsAdmin(app);
    const workId = await createWork(
      app,
      accessToken,
      `comment-update-security-${Date.now()}-${Math.random()
        .toString(36)
        .slice(2)}`,
    );
    const created = await createComment(app, workId);

    await request(app)
      .patch(`/admin/comments/${created.id}/approve`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    return { accessToken, workId, comment: created };
  }

  it('rejects a Mongo operator-key payload with 400 and does not mutate the comment (FR-004/AC-002/AC-007)', async () => {
    const { accessToken, workId, comment } = await setupApprovedComment();

    await request(app)
      .patch(`/admin/comments/${comment.id}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ $where: 'this.content' })
      .expect(400);

    const persisted = await findApprovedComment(app, workId, comment.id);

    expect(persisted?.content).toBe(comment.content);
  });

  it('rejects a dotted-key payload with 400 and does not mutate the comment (FR-004/AC-003/AC-007)', async () => {
    const { accessToken, workId, comment } = await setupApprovedComment();

    await request(app)
      .patch(`/admin/comments/${comment.id}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ 'content.nested': 'x' })
      .expect(400);

    const persisted = await findApprovedComment(app, workId, comment.id);

    expect(persisted?.content).toBe(comment.content);
  });

  it('rejects a __proto__ prototype-pollution-key payload with 400 and does not mutate the comment (FR-004/AC-003/AC-007)', async () => {
    const { accessToken, workId, comment } = await setupApprovedComment();

    await request(app)
      .patch(`/admin/comments/${comment.id}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send(JSON.parse('{"__proto__": {"polluted": true}}'))
      .expect(400);

    const persisted = await findApprovedComment(app, workId, comment.id);

    expect(persisted?.content).toBe(comment.content);
  });

  it('accepts a well-formed allowlisted payload and persists the update (AC-004/AC-005 regression)', async () => {
    const { accessToken, workId, comment } = await setupApprovedComment();

    await request(app)
      .patch(`/admin/comments/${comment.id}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ content: 'Comentário atualizado legitimamente.' })
      .expect(200);

    const persisted = await findApprovedComment(app, workId, comment.id);

    expect(persisted?.content).toBe(
      'Comentário atualizado legitimamente.',
    );
  });
});
