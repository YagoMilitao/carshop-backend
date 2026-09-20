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
});
