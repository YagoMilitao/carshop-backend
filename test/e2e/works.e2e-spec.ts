import request from 'supertest';
import { createApp } from '../../src/infra/server';
import {
  connectDatabase,
  disconnectDatabase,
} from '../../src/infra/database/mongoose';

interface AuthResponseBody {
  accessToken: string;
  sessionId: string;
  tokenType: 'Bearer';
}

interface WorkResponseBody {
  id: string;
  slug: string;
  title: string;
  description: string;
  category: string;
  tags: string[];
  images: unknown[];
  status: 'draft' | 'published';
  createdAt: string;
  updatedAt: string;
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

describe('Works listing authorization (e2e)', () => {
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
    app = createApp();
  });

  // CARSHOP-102 / FR-006 / NFR-003: this scenario reproduces the
  // originally reported vulnerability (an unauthenticated caller passing
  // includeDrafts=true received draft works with a 200). Before the fix
  // (GET /works had no auth-gating middleware at all), this expectation
  // failed because the endpoint returned 200 with the draft included
  // instead of 401. It now passes because
  // requireAuthForDraftsMiddleware rejects unauthenticated
  // includeDrafts=true requests with 401 and no draft data leaks.
  it('rejects unauthenticated GET /works?includeDrafts=true with 401 and no draft data (CARSHOP-102 regression / FR-006 evidence)', async () => {
    const accessToken = await loginAsAdmin(app);
    const draftSlug = `draft-work-${Date.now()}`;

    await request(app)
      .post('/works')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        slug: draftSlug,
        title: 'Draft work title',
        description: 'Draft work description',
        category: 'bancos',
        tags: ['couro'],
        status: 'draft',
      })
      .expect(201);

    const response = await request(app)
      .get('/works')
      .query({ includeDrafts: 'true' })
      .expect(401);

    expect(JSON.stringify(response.body)).not.toContain(draftSlug);
  });

  it('returns only published works for GET /works with no auth and no query (AC-001/AC-005)', async () => {
    const response = await request(app).get('/works').expect(200);
    const works = response.body as WorkResponseBody[];

    expect(Array.isArray(works)).toBe(true);
    expect(works.every((work) => work.status === 'published')).toBe(true);
  });

  it('returns draft works for authenticated GET /works?includeDrafts=true (AC-002)', async () => {
    const accessToken = await loginAsAdmin(app);
    const draftSlug = `draft-work-authorized-${Date.now()}`;

    await request(app)
      .post('/works')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        slug: draftSlug,
        title: 'Authorized draft work',
        description: 'Draft work description',
        category: 'bancos',
        tags: ['couro'],
        status: 'draft',
      })
      .expect(201);

    const response = await request(app)
      .get('/works')
      .query({ includeDrafts: 'true' })
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    const works = response.body as WorkResponseBody[];
    expect(works.some((work) => work.slug === draftSlug)).toBe(true);
  });

  // CARSHOP-117 / FR-001–FR-003, FR-007 / AC-001: GET /works/:slug is
  // public and returns a single published, non-deleted work by slug.
  it('returns a single published work for GET /works/:slug with no auth (AC-001)', async () => {
    const accessToken = await loginAsAdmin(app);
    const slug = `published-work-${Date.now()}`;

    await request(app)
      .post('/works')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        slug,
        title: 'Published work title',
        description: 'Published work description',
        category: 'bancos',
        tags: ['couro'],
        status: 'published',
      })
      .expect(201);

    const response = await request(app).get(`/works/${slug}`).expect(200);
    const work = response.body as WorkResponseBody;

    expect(work).toMatchObject({
      slug,
      title: 'Published work title',
      description: 'Published work description',
      category: 'bancos',
      tags: ['couro'],
      status: 'published',
    });
    expect(work.id).toEqual(expect.any(String));
    expect(Array.isArray(work.images)).toBe(true);
    expect(work.createdAt).toEqual(expect.any(String));
    expect(work.updatedAt).toEqual(expect.any(String));
  });

  // CARSHOP-117 / FR-004 / AC-002: unknown slug returns 404 for any caller.
  it('returns 404 for GET /works/:slug when the slug does not exist (AC-002)', async () => {
    await request(app)
      .get(`/works/does-not-exist-${Date.now()}`)
      .expect(404);
  });

  // CARSHOP-117 / FR-005, NFR-001 / AC-003: a draft work's slug must not
  // leak to an unauthenticated caller through the single-work endpoint.
  it('returns 404 for GET /works/:slug when the work is a draft, for an unauthenticated caller (AC-003)', async () => {
    const accessToken = await loginAsAdmin(app);
    const draftSlug = `draft-work-by-slug-${Date.now()}`;

    await request(app)
      .post('/works')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        slug: draftSlug,
        title: 'Draft work title',
        description: 'Draft work description',
        category: 'bancos',
        tags: ['couro'],
        status: 'draft',
      })
      .expect(201);

    const response = await request(app)
      .get(`/works/${draftSlug}`)
      .expect(404);

    expect(JSON.stringify(response.body)).not.toContain('Draft work title');
  });
});
