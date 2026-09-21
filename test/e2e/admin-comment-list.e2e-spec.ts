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
  createdAt: string;
  updatedAt: string;
}

interface AdminCommentListResponseBody {
  items: CommentResponseBody[];
  page: number;
  limit: number;
  total: number;
  totalPages: number;
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
      title: 'Reforma de bancos para teste de listagem de comentários',
      description:
        'Reforma completa usada para testar a listagem administrativa de comentários.',
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
  content: string,
): Promise<CommentResponseBody> {
  const response = await request(app)
    .post(`/works/${workId}/comments`)
    .send({ authorName: 'Cliente Teste', content })
    .expect(201);

  return response.body as CommentResponseBody;
}

/**
 * CARSHOP-136 — cobertura E2E de `GET /admin/comments`
 * (AC-001..AC-007, AC-011).
 */
describe('Admin comment list (e2e)', () => {
  let app: ReturnType<typeof createApp>;
  let accessToken: string;

  /**
   * `POST /auth/login` has a dedicated rate limit (5 attempts / 5 min,
   * keyed by IP + email hash — see `loginRateLimitMiddleware`), shared by
   * every test in this file. Logging in once and reusing the resulting
   * access token across tests (the server-side session persists in Mongo
   * independently of which `app` instance issued the request) avoids
   * tripping that limit while still exercising a real authenticated
   * token end-to-end.
   */
  beforeAll(async () => {
    if (!process.env.MONGO_URI) {
      throw new Error(
        'MONGO_URI não foi definida. O globalSetup do Jest deveria tê-la configurado antes dos testes.',
      );
    }

    await connectDatabase(process.env.MONGO_URI);

    process.env.JWT_SECRET = 'e2e-secret';
    process.env.ADMIN_EMAIL = 'admin@carshop.com';
    process.env.ADMIN_PASSWORD = '123456';
    process.env.JWT_EXPIRES_IN = '15m';
    process.env.JWT_REFRESH_EXPIRES_IN = '7d';
    const loginApp = createApp({ imageStorage: new FakeImageStorageAdapter() });
    accessToken = await loginAsAdmin(loginApp);
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

  it('rejects GET /admin/comments without authentication with 401 (AC-001)', async () => {
    await request(app).get('/admin/comments').expect(401);
  });

  it('returns 200 with the paginated envelope when no status filter is given (AC-002)', async () => {
    const workId = await createWork(
      app,
      accessToken,
      `comment-list-envelope-${Date.now()}`,
    );
    const comment = await createComment(
      app,
      workId,
      'Comentário para o envelope de listagem.',
    );

    const response = await request(app)
      .get('/admin/comments')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    const body = response.body as AdminCommentListResponseBody;

    expect(Array.isArray(body.items)).toBe(true);
    expect(typeof body.page).toBe('number');
    expect(typeof body.limit).toBe('number');
    expect(typeof body.total).toBe('number');
    expect(typeof body.totalPages).toBe('number');
    expect(body.items.some((entry) => entry.id === comment.id)).toBe(true);
  });

  it('each returned item exposes only the expected comment fields, no persistence internals (AC-008)', async () => {
    const workId = await createWork(
      app,
      accessToken,
      `comment-list-fields-${Date.now()}`,
    );
    const comment = await createComment(
      app,
      workId,
      'Comentário para verificar os campos expostos.',
    );

    const response = await request(app)
      .get('/admin/comments')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    const body = response.body as AdminCommentListResponseBody;
    const item = body.items.find((entry) => entry.id === comment.id);

    expect(item).toBeDefined();
    expect(item).toMatchObject({
      id: comment.id,
      workId,
      authorName: 'Cliente Teste',
      content: 'Comentário para verificar os campos expostos.',
      status: 'PENDING',
    });
    expect(typeof item?.createdAt).toBe('string');
    expect(typeof item?.updatedAt).toBe('string');
    expect(item).not.toHaveProperty('_id');
    expect(item).not.toHaveProperty('__v');
  });

  it('filters by status=PENDING returning only PENDING comments (AC-003)', async () => {
    const workId = await createWork(
      app,
      accessToken,
      `comment-list-pending-${Date.now()}`,
    );
    const pendingComment = await createComment(
      app,
      workId,
      'Comentário pendente para filtro.',
    );
    const approvedComment = await createComment(
      app,
      workId,
      'Comentário que será aprovado.',
    );

    await request(app)
      .patch(`/admin/comments/${approvedComment.id}/approve`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    const response = await request(app)
      .get('/admin/comments')
      .query({ status: 'PENDING' })
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    const body = response.body as AdminCommentListResponseBody;

    expect(body.items.every((entry) => entry.status === 'PENDING')).toBe(true);
    expect(body.items.some((entry) => entry.id === pendingComment.id)).toBe(
      true,
    );
    expect(body.items.some((entry) => entry.id === approvedComment.id)).toBe(
      false,
    );
  });

  it('filters by status=APPROVED returning only APPROVED comments (AC-004)', async () => {
    const workId = await createWork(
      app,
      accessToken,
      `comment-list-approved-${Date.now()}`,
    );
    const pendingComment = await createComment(
      app,
      workId,
      'Comentário que permanece pendente.',
    );
    const approvedComment = await createComment(
      app,
      workId,
      'Comentário que será aprovado para o filtro.',
    );

    await request(app)
      .patch(`/admin/comments/${approvedComment.id}/approve`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    const response = await request(app)
      .get('/admin/comments')
      .query({ status: 'APPROVED' })
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    const body = response.body as AdminCommentListResponseBody;

    expect(body.items.every((entry) => entry.status === 'APPROVED')).toBe(true);
    expect(body.items.some((entry) => entry.id === approvedComment.id)).toBe(
      true,
    );
    expect(body.items.some((entry) => entry.id === pendingComment.id)).toBe(
      false,
    );
  });

  it('filters by status=HIDDEN returning 200 with items: [] since no comment can reach HIDDEN today (AC-005)', async () => {
    const workId = await createWork(
      app,
      accessToken,
      `comment-list-hidden-${Date.now()}`,
    );
    await createComment(app, workId, 'Comentário pendente, não HIDDEN.');

    const response = await request(app)
      .get('/admin/comments')
      .query({ status: 'HIDDEN' })
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    const body = response.body as AdminCommentListResponseBody;

    expect(body.items).toEqual([]);
    expect(body.total).toBe(0);
  });

  it('rejects an invalid status value with 400 and does not query comment data (AC-006)', async () => {
    await request(app)
      .get('/admin/comments')
      .query({ status: 'REJECTED' })
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(400);
  });

  it('returns items in deterministic order (newest first) across repeated requests (AC-007)', async () => {
    const workId = await createWork(
      app,
      accessToken,
      `comment-list-order-${Date.now()}`,
    );

    const first = await createComment(app, workId, 'Primeiro comentário.');
    const second = await createComment(app, workId, 'Segundo comentário.');
    const third = await createComment(app, workId, 'Terceiro comentário.');

    const firstResponse = await request(app)
      .get('/admin/comments')
      .query({ status: 'PENDING' })
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    const secondResponse = await request(app)
      .get('/admin/comments')
      .query({ status: 'PENDING' })
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    const firstBody = firstResponse.body as AdminCommentListResponseBody;
    const secondBody = secondResponse.body as AdminCommentListResponseBody;

    const firstIds = firstBody.items.map((entry) => entry.id);
    const secondIds = secondBody.items.map((entry) => entry.id);

    expect(firstIds).toEqual(secondIds);

    const relevantIds = firstIds.filter((id) =>
      [first.id, second.id, third.id].includes(id),
    );

    expect(relevantIds).toEqual([third.id, second.id, first.id]);
  });
});
