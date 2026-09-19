import request from 'supertest';
import { createApp } from '../../src/infra/server';
import {
  connectDatabase,
  disconnectDatabase,
} from '../../src/infra/database/mongoose';
import { FakeImageStorageAdapter } from './support/fake-image-storage.adapter';
import { AuthSessionModel } from '../../src/data/models/auth-session.model';

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
  const loginBody = await loginAsAdminWithSession(app);

  return loginBody.accessToken;
}

async function loginAsAdminWithSession(
  app: ReturnType<typeof createApp>,
): Promise<AuthResponseBody> {
  const loginResponse = await request(app)
    .post('/auth/login')
    .send({ email: 'admin@carshop.com', password: '123456' })
    .expect(200);

  return loginResponse.body as AuthResponseBody;
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
      title: 'Reforma de bancos para exclusão de comentário',
      description: 'Reforma completa usada para testar exclusão de comentário.',
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
    .send({ authorName: 'Cliente Teste', content: 'Comentário de teste.' })
    .expect(201);

  return response.body as CommentResponseBody;
}

/**
 * CARSHOP-103 Addendum A — FR-A04/FR-A05 / AC-A04: cobertura E2E
 * permanente de `DELETE /admin/comments/:commentId` (exclusão definitiva
 * de comentário pelo admin), incluindo o guard de autenticação.
 */
describe('Admin comment hard-delete (e2e)', () => {
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

  it('rejects DELETE /admin/comments/:commentId without authentication with 401 (FR-A05/AC-A04)', async () => {
    await request(app)
      .delete(`/admin/comments/never-existed-${Date.now()}`)
      .expect(401);
  });

  it('deletes an existing comment when authenticated and it no longer appears after approval (FR-A04/AC-A04)', async () => {
    const accessToken = await loginAsAdmin(app);
    const workId = await createWork(
      app,
      accessToken,
      `comment-hard-delete-${Date.now()}`,
    );
    const comment = await createComment(app, workId);

    await request(app)
      .patch(`/admin/comments/${comment.id}/approve`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    const beforeDeleteResponse = await request(app)
      .get(`/works/${workId}/comments`)
      .expect(200);
    const commentsBeforeDelete =
      beforeDeleteResponse.body as CommentResponseBody[];

    expect(commentsBeforeDelete.some((entry) => entry.id === comment.id)).toBe(
      true,
    );

    await request(app)
      .delete(`/admin/comments/${comment.id}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200)
      .expect({ success: true });

    const afterDeleteResponse = await request(app)
      .get(`/works/${workId}/comments`)
      .expect(200);
    const commentsAfterDelete =
      afterDeleteResponse.body as CommentResponseBody[];

    expect(commentsAfterDelete.some((entry) => entry.id === comment.id)).toBe(
      false,
    );
  });

  // CARSHOP-138 — FR-004/AC-002: a token bound to a session revoked in
  // SessionStorePort must be rejected with 401 on DELETE
  // /admin/comments/:commentId, without deleting the comment.
  it('rejects DELETE /admin/comments/:commentId with 401 when the session has been revoked, and does not delete the comment (FR-004/AC-002)', async () => {
    const login = await loginAsAdminWithSession(app);
    const workId = await createWork(
      app,
      login.accessToken,
      `comment-hard-delete-revoked-${Date.now()}`,
    );
    const comment = await createComment(app, workId);

    await request(app)
      .patch(`/admin/comments/${comment.id}/approve`)
      .set('Authorization', `Bearer ${login.accessToken}`)
      .expect(200);

    // Mirrors MongoSessionStoreRepository.revoke()'s own update shape.
    await AuthSessionModel.findOneAndUpdate(
      { id: login.sessionId },
      { revokedAt: Date.now() },
    );

    await request(app)
      .delete(`/admin/comments/${comment.id}`)
      .set('Authorization', `Bearer ${login.accessToken}`)
      .expect(401);

    const afterRevokedAttempt = await request(app)
      .get(`/works/${workId}/comments`)
      .expect(200);
    const commentsAfterRevokedAttempt =
      afterRevokedAttempt.body as CommentResponseBody[];

    expect(
      commentsAfterRevokedAttempt.some((entry) => entry.id === comment.id),
    ).toBe(true);
  });
});
