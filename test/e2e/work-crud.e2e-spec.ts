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
  title: string;
  status: 'draft' | 'published';
}

async function loginAsAdmin(
  app: ReturnType<typeof createApp>,
): Promise<string> {
  const loginResponse = await request(app)
    .post('/auth/login')
    .send({ email: process.env.ADMIN_EMAIL, password: '123456' })
    .expect(200);
  const loginBody = loginResponse.body as AuthResponseBody;

  return loginBody.accessToken;
}

function buildWorkPayload(slug: string) {
  return {
    slug,
    title: 'Reforma completa de bancos em couro',
    description: 'Reforma completa realizada em bancos de couro legítimo.',
    category: 'bancos',
    tags: ['couro'],
    status: 'published',
  };
}

/**
 * CARSHOP-103 — FR-001–FR-004 / AC-001: cobertura E2E permanente de
 * `POST /works` (sucesso, sem autenticação, slug duplicado e payload
 * inválido).
 */
describe('Work CRUD (e2e)', () => {
  let app: ReturnType<typeof createApp>;
  // The login limiter is a module-level singleton keyed by IP + email.
  // A distinct admin email per test keeps each case in an isolated bucket.
  let testSequence = 0;

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
    testSequence += 1;
    process.env.JWT_SECRET = 'e2e-secret';
    process.env.ADMIN_EMAIL = `admin-work-crud-${testSequence}@carshop.com`;
    process.env.ADMIN_PASSWORD = '123456';
    process.env.JWT_EXPIRES_IN = '15m';
    process.env.JWT_REFRESH_EXPIRES_IN = '7d';
    app = createApp({ imageStorage: new FakeImageStorageAdapter() });
  });

  it('creates a work with a valid payload and returns 201 with id and slug (FR-001/AC-001)', async () => {
    const accessToken = await loginAsAdmin(app);
    const slug = `work-crud-success-${Date.now()}`;

    const response = await request(app)
      .post('/works')
      .set('Authorization', `Bearer ${accessToken}`)
      .send(buildWorkPayload(slug))
      .expect(201);

    const work = response.body as WorkResponseBody;

    expect(work.id).toBeDefined();
    expect(work.slug).toBe(slug);
  });

  it('rejects POST /works without an Authorization header with 401 and does not create the work (FR-002/AC-001)', async () => {
    const slug = `work-crud-no-auth-${Date.now()}`;

    await request(app).post('/works').send(buildWorkPayload(slug)).expect(401);

    const listResponse = await request(app).get('/works').expect(200);
    const works = listResponse.body as WorkResponseBody[];

    expect(works.some((work) => work.slug === slug)).toBe(false);
  });

  it('rejects POST /works with an already-existing slug with 409 (FR-003/AC-001)', async () => {
    const accessToken = await loginAsAdmin(app);
    const slug = `work-crud-duplicate-${Date.now()}`;

    await request(app)
      .post('/works')
      .set('Authorization', `Bearer ${accessToken}`)
      .send(buildWorkPayload(slug))
      .expect(201);

    await request(app)
      .post('/works')
      .set('Authorization', `Bearer ${accessToken}`)
      .send(buildWorkPayload(slug))
      .expect(409);
  });

  it('rejects POST /works with a payload missing required fields with 400 (FR-004/AC-001)', async () => {
    const accessToken = await loginAsAdmin(app);

    await request(app)
      .post('/works')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        description: 'Descrição sem título nem slug.',
        category: 'bancos',
      })
      .expect(400);
  });

  it('rejects POST /works with an extra, undocumented field and does not persist it (CARSHOP-139 FR-001/FR-005/AC-001)', async () => {
    const accessToken = await loginAsAdmin(app);
    const slug = `work-crud-mass-assignment-${Date.now()}`;

    await request(app)
      .post('/works')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ ...buildWorkPayload(slug), isAdminOnlyFlag: true })
      .expect(400);

    const listResponse = await request(app).get('/works').expect(200);
    const works = listResponse.body as WorkResponseBody[];

    expect(works.some((work) => work.slug === slug)).toBe(false);
  });

  it('rejects POST /works with a Mongo-operator-style field name and does not mutate any document (CARSHOP-139 FR-004/AC-002)', async () => {
    const accessToken = await loginAsAdmin(app);
    const slug = `work-crud-operator-key-${Date.now()}`;

    await request(app)
      .post('/works')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ ...buildWorkPayload(slug), $where: 'this.status == "published"' })
      .expect(400);

    const listResponse = await request(app).get('/works').expect(200);
    const works = listResponse.body as WorkResponseBody[];

    expect(works.some((work) => work.slug === slug)).toBe(false);
  });

  it('rejects POST /works with a prototype-pollution-style field name and does not mutate any document (CARSHOP-139 FR-004/AC-003)', async () => {
    const accessToken = await loginAsAdmin(app);
    const slug = `work-crud-proto-pollution-${Date.now()}`;

    /**
     * `__proto__` não pode ser incluído como propriedade própria de um
     * objeto usando sintaxe de literal ou atribuição por colchetes/ponto
     * (isso apenas alteraria o protótipo do objeto em memória via o
     * setter herdado de `Object.prototype`, sem nunca aparecer como uma
     * propriedade enumerável no JSON serializado). Construímos e enviamos
     * a string JSON bruta diretamente; passar um objeto para
     * `supertest.send()` faria a mesclagem interna consumir essa chave
     * antes de ela chegar ao servidor.
     */
    const basePayloadJson = JSON.stringify(buildWorkPayload(slug)).slice(1);
    const maliciousPayloadJson = `{"__proto__":{"polluted":true},${basePayloadJson}`;

    await request(app)
      .post('/works')
      .set('Authorization', `Bearer ${accessToken}`)
      .type('application/json')
      .send(maliciousPayloadJson)
      .expect(400);

    const listResponse = await request(app).get('/works').expect(200);
    const works = listResponse.body as WorkResponseBody[];

    expect(works.some((work) => work.slug === slug)).toBe(false);
  });

  /**
   * CARSHOP-135 — FR-001–FR-009 / AC-001–AC-007: cobertura E2E de
   * `PATCH /admin/works/{workId}` (atualização parcial de um work).
   */
  describe('PATCH /admin/works/:workId (CARSHOP-135)', () => {
    interface WorkDetailResponseBody extends WorkResponseBody {
      description: string;
      category: string;
      tags: string[];
    }

    it('applies a successful partial update, leaving unspecified fields unchanged (AC-001)', async () => {
      const accessToken = await loginAsAdmin(app);
      const slug = `work-patch-success-${Date.now()}`;

      const createResponse = await request(app)
        .post('/works')
        .set('Authorization', `Bearer ${accessToken}`)
        .send(buildWorkPayload(slug))
        .expect(201);
      const created = createResponse.body as WorkDetailResponseBody;

      const patchResponse = await request(app)
        .patch(`/admin/works/${created.id}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ title: 'Título atualizado via PATCH' })
        .expect(200);
      const patched = patchResponse.body as WorkDetailResponseBody;

      expect(patched.title).toBe('Título atualizado via PATCH');
      expect(patched.slug).toBe(slug);
      expect(patched.category).toBe('bancos');

      const getResponse = await request(app).get(`/works/${slug}`).expect(200);
      const fetched = getResponse.body as WorkDetailResponseBody;

      expect(fetched.title).toBe('Título atualizado via PATCH');
      expect(fetched.slug).toBe(slug);
      expect(fetched.category).toBe('bancos');
    });

    it('rejects PATCH without an Authorization header with 401 and does not modify the work (AC-002)', async () => {
      const accessToken = await loginAsAdmin(app);
      const slug = `work-patch-no-auth-${Date.now()}`;

      const createResponse = await request(app)
        .post('/works')
        .set('Authorization', `Bearer ${accessToken}`)
        .send(buildWorkPayload(slug))
        .expect(201);
      const created = createResponse.body as WorkDetailResponseBody;

      await request(app)
        .patch(`/admin/works/${created.id}`)
        .send({ title: 'Não deveria aplicar' })
        .expect(401);

      const getResponse = await request(app).get(`/works/${slug}`).expect(200);
      const fetched = getResponse.body as WorkDetailResponseBody;

      expect(fetched.title).toBe(buildWorkPayload(slug).title);
    });

    it('rejects PATCH for a nonexistent workId with 404 (AC-003)', async () => {
      const accessToken = await loginAsAdmin(app);

      await request(app)
        .patch('/admin/works/does-not-exist-workid')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ title: 'Não deveria existir' })
        .expect(404);
    });

    it('rejects a slug update that collides with another existing work with 409, leaving both works unchanged (AC-004)', async () => {
      const accessToken = await loginAsAdmin(app);
      const slugA = `work-patch-conflict-a-${Date.now()}`;
      const slugB = `work-patch-conflict-b-${Date.now()}`;

      const createAResponse = await request(app)
        .post('/works')
        .set('Authorization', `Bearer ${accessToken}`)
        .send(buildWorkPayload(slugA))
        .expect(201);
      const workA = createAResponse.body as WorkDetailResponseBody;

      await request(app)
        .post('/works')
        .set('Authorization', `Bearer ${accessToken}`)
        .send(buildWorkPayload(slugB))
        .expect(201);

      await request(app)
        .patch(`/admin/works/${workA.id}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ slug: slugB })
        .expect(409);

      const getAResponse = await request(app)
        .get(`/works/${slugA}`)
        .expect(200);
      const getBResponse = await request(app)
        .get(`/works/${slugB}`)
        .expect(200);
      const fetchedA = getAResponse.body as WorkDetailResponseBody;
      const fetchedB = getBResponse.body as WorkDetailResponseBody;

      expect(fetchedA.slug).toBe(slugA);
      expect(fetchedB.slug).toBe(slugB);
    });

    it('rejects a payload with an invalid field type and does not partially persist it (AC-005)', async () => {
      const accessToken = await loginAsAdmin(app);
      const slug = `work-patch-invalid-type-${Date.now()}`;

      const createResponse = await request(app)
        .post('/works')
        .set('Authorization', `Bearer ${accessToken}`)
        .send(buildWorkPayload(slug))
        .expect(201);
      const created = createResponse.body as WorkDetailResponseBody;

      await request(app)
        .patch(`/admin/works/${created.id}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ tags: 'couro-e-tecido' })
        .expect(400);

      const getResponse = await request(app).get(`/works/${slug}`).expect(200);
      const fetched = getResponse.body as WorkDetailResponseBody;

      expect(fetched.tags).toEqual(buildWorkPayload(slug).tags);
    });

    it('rejects a payload with an oversized title and does not partially persist it (AC-005)', async () => {
      const accessToken = await loginAsAdmin(app);
      const slug = `work-patch-oversized-${Date.now()}`;

      const createResponse = await request(app)
        .post('/works')
        .set('Authorization', `Bearer ${accessToken}`)
        .send(buildWorkPayload(slug))
        .expect(201);
      const created = createResponse.body as WorkDetailResponseBody;

      await request(app)
        .patch(`/admin/works/${created.id}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ title: 'a'.repeat(121) })
        .expect(400);

      const getResponse = await request(app).get(`/works/${slug}`).expect(200);
      const fetched = getResponse.body as WorkDetailResponseBody;

      expect(fetched.title).toBe(buildWorkPayload(slug).title);
    });

    it('rejects an extra, undocumented field and does not persist it (AC-007, mirrors CARSHOP-139)', async () => {
      const accessToken = await loginAsAdmin(app);
      const slug = `work-patch-mass-assignment-${Date.now()}`;

      const createResponse = await request(app)
        .post('/works')
        .set('Authorization', `Bearer ${accessToken}`)
        .send(buildWorkPayload(slug))
        .expect(201);
      const created = createResponse.body as WorkDetailResponseBody;

      await request(app)
        .patch(`/admin/works/${created.id}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ title: 'Novo título', isAdminOnlyFlag: true })
        .expect(400);

      const getResponse = await request(app).get(`/works/${slug}`).expect(200);
      const fetched = getResponse.body as WorkDetailResponseBody;

      expect(fetched.title).toBe(buildWorkPayload(slug).title);
    });

    it('rejects a Mongo-operator-style field name and does not mutate any document (AC-007, mirrors CARSHOP-139)', async () => {
      const accessToken = await loginAsAdmin(app);
      const slug = `work-patch-operator-key-${Date.now()}`;

      const createResponse = await request(app)
        .post('/works')
        .set('Authorization', `Bearer ${accessToken}`)
        .send(buildWorkPayload(slug))
        .expect(201);
      const created = createResponse.body as WorkDetailResponseBody;

      await request(app)
        .patch(`/admin/works/${created.id}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ $where: 'this.status == "published"' })
        .expect(400);

      const getResponse = await request(app).get(`/works/${slug}`).expect(200);
      const fetched = getResponse.body as WorkDetailResponseBody;

      expect(fetched.title).toBe(buildWorkPayload(slug).title);
    });

    it('rejects a prototype-pollution-style field name and does not mutate any document (AC-007, mirrors CARSHOP-139)', async () => {
      const accessToken = await loginAsAdmin(app);
      const slug = `work-patch-proto-pollution-${Date.now()}`;

      const createResponse = await request(app)
        .post('/works')
        .set('Authorization', `Bearer ${accessToken}`)
        .send(buildWorkPayload(slug))
        .expect(201);
      const created = createResponse.body as WorkDetailResponseBody;

      const maliciousPayloadJson =
        '{"__proto__":{"polluted":true},"title":"Título malicioso"}';

      await request(app)
        .patch(`/admin/works/${created.id}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .type('application/json')
        .send(maliciousPayloadJson)
        .expect(400);

      const getResponse = await request(app).get(`/works/${slug}`).expect(200);
      const fetched = getResponse.body as WorkDetailResponseBody;

      expect(fetched.title).toBe(buildWorkPayload(slug).title);
    });
  });
});
