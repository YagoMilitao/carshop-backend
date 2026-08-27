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
      title: 'Reforma de bancos para comentários',
      description: 'Reforma completa usada para testar comentários.',
      category: 'bancos',
      tags: ['couro'],
      status: 'published',
    })
    .expect(201);

  const work = response.body as WorkResponseBody;

  return work.id;
}

/**
 * CARSHOP-103 — FR-005 (fallback)/AC-002, FR-011–FR-015a / AC-006, AC-007,
 * AC-008: cobertura E2E permanente do fluxo público de criação de
 * comentários e da moderação administrativa (aprovação e edição).
 */
describe('Comment creation and admin moderation flow (e2e)', () => {
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

  it('creates a pending comment with a valid payload on an existing work and returns 201 (FR-011/AC-006)', async () => {
    const accessToken = await loginAsAdmin(app);
    const workId = await createWork(
      app,
      accessToken,
      `comment-valid-${Date.now()}`,
    );

    const response = await request(app)
      .post(`/works/${workId}/comments`)
      .send({ authorName: 'Cliente Satisfeito', content: 'Ficou excelente!' })
      .expect(201);

    const comment = response.body as CommentResponseBody;

    expect(comment.workId).toBe(workId);
    expect(comment.status).toBe('PENDING');
  });

  it('rejects a comment with an invalid payload with 400 (FR-012/AC-006)', async () => {
    const accessToken = await loginAsAdmin(app);
    const workId = await createWork(
      app,
      accessToken,
      `comment-invalid-${Date.now()}`,
    );

    await request(app)
      .post(`/works/${workId}/comments`)
      .send({ authorName: 'Ok', content: 'a' })
      .expect(400);
  });

  it('returns 404 when creating a comment on a non-existent work (FR-013/AC-006)', async () => {
    await request(app)
      .post(`/works/never-existed-${Date.now()}/comments`)
      .send({ authorName: 'Cliente Qualquer', content: 'Comentário válido.' })
      .expect(404);
  });

  it('follows the full stateful flow: create work → create comment → confirm pending is absent → approve → confirm present (FR-014, FR-015/AC-007)', async () => {
    const accessToken = await loginAsAdmin(app);
    const workId = await createWork(
      app,
      accessToken,
      `comment-flow-${Date.now()}`,
    );

    const createResponse = await request(app)
      .post(`/works/${workId}/comments`)
      .send({ authorName: 'Fluxo Completo', content: 'Comentário do fluxo.' })
      .expect(201);
    const createdComment = createResponse.body as CommentResponseBody;

    const beforeApprovalResponse = await request(app)
      .get(`/works/${workId}/comments`)
      .expect(200);
    const commentsBeforeApproval =
      beforeApprovalResponse.body as CommentResponseBody[];

    expect(
      commentsBeforeApproval.some(
        (comment) => comment.id === createdComment.id,
      ),
    ).toBe(false);

    await request(app)
      .patch(`/admin/comments/${createdComment.id}/approve`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    const afterApprovalResponse = await request(app)
      .get(`/works/${workId}/comments`)
      .expect(200);
    const commentsAfterApproval =
      afterApprovalResponse.body as CommentResponseBody[];

    expect(
      commentsAfterApproval.some(
        (comment) => comment.id === createdComment.id,
      ),
    ).toBe(true);
  });

  it('rejects approval without authentication with 401 and returns 404 for a non-existent comment id (FR-015a/AC-008)', async () => {
    const accessToken = await loginAsAdmin(app);
    const workId = await createWork(
      app,
      accessToken,
      `comment-approve-guard-${Date.now()}`,
    );

    const createResponse = await request(app)
      .post(`/works/${workId}/comments`)
      .send({ authorName: 'Sem Autenticação', content: 'Comentário teste.' })
      .expect(201);
    const createdComment = createResponse.body as CommentResponseBody;

    await request(app)
      .patch(`/admin/comments/${createdComment.id}/approve`)
      .expect(401);

    await request(app)
      .patch(`/admin/comments/never-existed-${Date.now()}/approve`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(404);
  });

  // FR-005/AC-002 fallback: no dedicated work-update endpoint exists in
  // the current route inventory (confirmed by the architect against
  // `src/infra/http/routes/*.routes.ts`), so this authenticated partial
  // update via PATCH /admin/comments/:commentId is used as the closest
  // existing update-capable behavior, per the spec's documented fallback.
  it('updates an existing comment via authenticated PATCH /admin/comments/:commentId and persists the new state (FR-005 fallback/AC-002)', async () => {
    const accessToken = await loginAsAdmin(app);
    const workId = await createWork(
      app,
      accessToken,
      `comment-update-${Date.now()}`,
    );

    const createResponse = await request(app)
      .post(`/works/${workId}/comments`)
      .send({ authorName: 'Autor Original', content: 'Conteúdo original.' })
      .expect(201);
    const createdComment = createResponse.body as CommentResponseBody;

    const updateResponse = await request(app)
      .patch(`/admin/comments/${createdComment.id}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ content: 'Conteúdo atualizado pelo administrador.' })
      .expect(200);
    const updatedComment = updateResponse.body as CommentResponseBody;

    expect(updatedComment.content).toBe(
      'Conteúdo atualizado pelo administrador.',
    );
  });
});
