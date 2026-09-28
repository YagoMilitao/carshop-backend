import request from 'supertest';
import { ipKeyGenerator } from 'express-rate-limit';
import { createApp } from '../../src/infra/server';
import {
  connectDatabase,
  disconnectDatabase,
} from '../../src/infra/database/mongoose';
import { globalRateLimitMiddleware } from '../../src/infra/presentation/middleware/rate-limit.middleware';
import { AuthSessionModel } from '../../src/data/models/auth-session.model';
import { HomeImageSettingModel } from '../../src/data/models/home-image-setting.model';
import { MongoWorkRepository } from '../../src/infra/repositories/mongo-work.repository';
import { FakeImageStorageAdapter } from './support/fake-image-storage.adapter';
import { VALID_JPEG_BUFFER } from './support/valid-image-fixtures';

/**
 * CARSHOP-159 — E2E coverage of `GET /home-image` (public) and
 * `PATCH /admin/home-image` (Bearer) against a real (in-memory) MongoDB.
 *
 * Traceability: AC-001..AC-012, AC-014, AC-015. AC-013 (429) lives in
 * `home-image-rate-limit.e2e-spec.ts` to isolate the limiter state.
 */

interface AuthResponseBody {
  accessToken: string;
  sessionId: string;
  tokenType: 'Bearer';
}

interface WorkResponseBody {
  id: string;
  images: Array<{ id: string; url: string; alt: string; publicId: string }>;
}

interface HomeImageBody {
  workId: string;
  imageId: string;
  url: string;
  alt: string;
}

interface HomeImageResponseBody {
  image: HomeImageBody | null;
}

interface UploadedImage {
  workId: string;
  imageId: string;
  url: string;
  alt: string;
  publicId: string;
}

const LOOPBACK_RATE_LIMIT_KEYS = [
  ipKeyGenerator('127.0.0.1'),
  ipKeyGenerator('::1'),
];

const FORBIDDEN_RESPONSE_FRAGMENTS = [
  'publicId',
  'stack',
  '"_id"',
  '"key"',
  'deletedAt',
  'mongodb',
];

function expectNoInternalData(body: unknown): void {
  const serialized = JSON.stringify(body);

  for (const fragment of FORBIDDEN_RESPONSE_FRAGMENTS) {
    expect(serialized).not.toContain(fragment);
  }
}

describe('Home image configuration (e2e, CARSHOP-159)', () => {
  let app: ReturnType<typeof createApp>;
  // The login limiter is keyed by IP + email: a distinct admin email per
  // test keeps each case in its own login bucket.
  let testSequence = 0;
  let slugSequence = 0;

  beforeAll(async () => {
    if (!process.env.MONGO_URI) {
      throw new Error(
        'MONGO_URI não foi definida. O globalSetup do Jest deveria tê-la configurado antes dos testes.',
      );
    }

    await connectDatabase(process.env.MONGO_URI);
  });

  afterAll(async () => {
    await HomeImageSettingModel.deleteMany({});
    await disconnectDatabase();
  });

  beforeEach(async () => {
    testSequence += 1;
    await HomeImageSettingModel.deleteMany({});

    // This file issues well over 100 requests; the global limiter is a
    // module-level singleton, so each case starts from a clean bucket.
    for (const key of LOOPBACK_RATE_LIMIT_KEYS) {
      globalRateLimitMiddleware.resetKey(key);
    }

    process.env.JWT_SECRET = 'e2e-secret';
    process.env.ADMIN_EMAIL = `admin-home-image-${testSequence}@carshop.com`;
    process.env.ADMIN_PASSWORD = '123456';
    process.env.JWT_EXPIRES_IN = '15m';
    process.env.JWT_REFRESH_EXPIRES_IN = '7d';
    app = createApp({ imageStorage: new FakeImageStorageAdapter() });
  });

  async function login(): Promise<AuthResponseBody> {
    const response = await request(app)
      .post('/auth/login')
      .send({ email: process.env.ADMIN_EMAIL, password: '123456' })
      .expect(200);

    return response.body as AuthResponseBody;
  }

  async function createWork(
    accessToken: string,
    status: 'draft' | 'published' = 'published',
  ): Promise<string> {
    slugSequence += 1;
    const response = await request(app)
      .post('/works')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        slug: `home-image-${Date.now()}-${slugSequence}`,
        title: 'Reforma usada na imagem da Home',
        description: 'Reforma completa usada para testar a imagem da Home.',
        category: 'bancos',
        tags: ['couro'],
        status,
      })
      .expect(201);

    return (response.body as WorkResponseBody).id;
  }

  async function uploadImage(
    accessToken: string,
    workId: string,
    alt: string,
  ): Promise<UploadedImage> {
    await request(app)
      .post(`/admin/works/${workId}/images`)
      .set('Authorization', `Bearer ${accessToken}`)
      .field('alt', alt)
      .attach('file', VALID_JPEG_BUFFER, {
        filename: 'home-photo.jpg',
        contentType: 'image/jpeg',
      })
      .expect(201);

    const listResponse = await request(app)
      .get('/works')
      .query({ includeDrafts: 'true' })
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    const work = (listResponse.body as WorkResponseBody[]).find(
      (candidate) => candidate.id === workId,
    );
    const image = work?.images.find((candidate) => candidate.alt === alt);

    if (!image) {
      throw new Error('Uploaded image not found in work listing.');
    }

    return {
      workId,
      imageId: image.id,
      url: image.url,
      alt: image.alt,
      publicId: image.publicId,
    };
  }

  async function createPublishedWorkWithImage(
    accessToken: string,
    alt = 'Banco reformado em couro preto',
  ): Promise<UploadedImage> {
    const workId = await createWork(accessToken);

    return uploadImage(accessToken, workId, alt);
  }

  function selectHomeImage(accessToken: string, body: unknown) {
    return request(app)
      .patch('/admin/home-image')
      .set('Authorization', `Bearer ${accessToken}`)
      .send(body as object);
  }

  async function readHomeImage(): Promise<HomeImageResponseBody> {
    const response = await request(app).get('/home-image').expect(200);

    expectNoInternalData(response.body);

    return response.body as HomeImageResponseBody;
  }

  function toHomeImage(image: UploadedImage): HomeImageBody {
    return {
      workId: image.workId,
      imageId: image.imageId,
      url: image.url,
      alt: image.alt,
    };
  }

  it('returns 200 { image: null } deterministically when nothing is configured (AC-002)', async () => {
    const first = await request(app).get('/home-image').expect(200);
    const second = await request(app).get('/home-image').expect(200);

    expect(first.body).toEqual({ image: null });
    expect(second.body).toEqual(first.body);
    await expect(HomeImageSettingModel.countDocuments()).resolves.toBe(0);
  });

  it('selects an eligible image and the public read returns its url and alt (AC-001, AC-003, AC-012)', async () => {
    const { accessToken } = await login();
    const image = await createPublishedWorkWithImage(accessToken);

    const selectResponse = await selectHomeImage(accessToken, {
      workId: image.workId,
      imageId: image.imageId,
    }).expect(200);

    expect(selectResponse.body).toEqual({ image: toHomeImage(image) });
    expectNoInternalData(selectResponse.body);
    expect(
      (selectResponse.body as HomeImageResponseBody).image,
    ).not.toHaveProperty('publicId');

    const homeImage = await readHomeImage();

    expect(homeImage).toEqual({ image: toHomeImage(image) });
    expect(homeImage.image?.url).toMatch(/^https:\/\//);
    expect(Object.keys(homeImage.image ?? {}).sort()).toEqual([
      'alt',
      'imageId',
      'url',
      'workId',
    ]);
  });

  it('replaces the previous selection and keeps exactly one configuration (AC-004)', async () => {
    const { accessToken } = await login();
    const firstImage = await createPublishedWorkWithImage(
      accessToken,
      'Primeira imagem',
    );
    const secondImage = await createPublishedWorkWithImage(
      accessToken,
      'Segunda imagem',
    );

    await selectHomeImage(accessToken, {
      workId: firstImage.workId,
      imageId: firstImage.imageId,
    }).expect(200);
    await selectHomeImage(accessToken, {
      workId: secondImage.workId,
      imageId: secondImage.imageId,
    }).expect(200);

    await expect(readHomeImage()).resolves.toEqual({
      image: toHomeImage(secondImage),
    });
    await expect(HomeImageSettingModel.countDocuments()).resolves.toBe(1);
  });

  it('rejects a nonexistent image or work with 404 and keeps the previous configuration (AC-005)', async () => {
    const { accessToken } = await login();
    const image = await createPublishedWorkWithImage(accessToken);

    await selectHomeImage(accessToken, {
      workId: image.workId,
      imageId: image.imageId,
    }).expect(200);

    const missingImage = await selectHomeImage(accessToken, {
      workId: image.workId,
      imageId: '00000000-0000-4000-8000-000000000000',
    }).expect(404);

    expect(missingImage.body).toMatchObject({
      message: 'Imagem não encontrada.',
    });
    expectNoInternalData(missingImage.body);

    const missingWork = await selectHomeImage(accessToken, {
      workId: '00000000-0000-4000-8000-000000000001',
      imageId: image.imageId,
    }).expect(404);

    expect(missingWork.body).toMatchObject({
      message: 'Trabalho não encontrado.',
    });

    await expect(readHomeImage()).resolves.toEqual({
      image: toHomeImage(image),
    });
    await expect(HomeImageSettingModel.countDocuments()).resolves.toBe(1);
  });

  it('rejects an image of a draft work with 409 and keeps the previous configuration (AC-006)', async () => {
    const { accessToken } = await login();
    const configuredImage = await createPublishedWorkWithImage(accessToken);
    const draftWorkId = await createWork(accessToken, 'draft');
    const draftImage = await uploadImage(
      accessToken,
      draftWorkId,
      'Imagem de rascunho',
    );

    await selectHomeImage(accessToken, {
      workId: configuredImage.workId,
      imageId: configuredImage.imageId,
    }).expect(200);

    const response = await selectHomeImage(accessToken, {
      workId: draftImage.workId,
      imageId: draftImage.imageId,
    }).expect(409);

    expect(response.body).toMatchObject({
      message:
        'A imagem selecionada não é elegível: o trabalho não está publicado.',
    });
    expectNoInternalData(response.body);
    await expect(readHomeImage()).resolves.toEqual({
      image: toHomeImage(configuredImage),
    });
  });

  it('rejects missing or malformed bodies with 400 and changes nothing (AC-007)', async () => {
    const { accessToken } = await login();
    const image = await createPublishedWorkWithImage(accessToken);

    await selectHomeImage(accessToken, {
      workId: image.workId,
      imageId: image.imageId,
    }).expect(200);

    const invalidBodies: unknown[] = [
      {},
      { workId: image.workId },
      { workId: image.workId, imageId: 123 },
      { workId: image.workId, imageId: image.imageId, extra: true },
      [image.workId, image.imageId],
    ];

    for (const body of invalidBodies) {
      const response = await selectHomeImage(accessToken, body).expect(400);

      expect(response.body).toMatchObject({ message: 'Payload inválido.' });
      expectNoInternalData(response.body);
    }

    // No body at all.
    const noBody = await request(app)
      .patch('/admin/home-image')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(400);

    expect(noBody.body).toMatchObject({ message: 'Payload inválido.' });

    // Malformed JSON.
    const malformedJson = await request(app)
      .patch('/admin/home-image')
      .set('Authorization', `Bearer ${accessToken}`)
      .set('Content-Type', 'application/json')
      .send('{"workId":')
      .expect(400);

    // Rejected by the JSON body parser before the Zod schema runs.
    expect(malformedJson.body).toEqual({
      message: 'JSON inválido no corpo da requisição.',
    });
    expectNoInternalData(malformedJson.body);

    await expect(readHomeImage()).resolves.toEqual({
      image: toHomeImage(image),
    });
    await expect(HomeImageSettingModel.countDocuments()).resolves.toBe(1);
  });

  it('rejects arbitrary client URLs with 400 and never serves them (AC-008)', async () => {
    const { accessToken } = await login();
    const image = await createPublishedWorkWithImage(accessToken);
    const attackerUrl = 'https://attacker.example.com/hero.jpg';

    await selectHomeImage(accessToken, {
      workId: image.workId,
      imageId: image.imageId,
    }).expect(200);

    await selectHomeImage(accessToken, { url: attackerUrl }).expect(400);
    await selectHomeImage(accessToken, {
      workId: image.workId,
      imageId: image.imageId,
      url: attackerUrl,
    }).expect(400);
    await selectHomeImage(accessToken, {
      workId: image.workId,
      imageId: attackerUrl,
    }).expect(400);

    const homeImage = await readHomeImage();

    expect(homeImage).toEqual({ image: toHomeImage(image) });
    expect(JSON.stringify(homeImage)).not.toContain('attacker.example.com');
  });

  it('rejects PATCH without a token, with an invalid token and with a revoked session with 401, changing nothing (AC-009)', async () => {
    const session = await login();
    const image = await createPublishedWorkWithImage(session.accessToken);
    const body = { workId: image.workId, imageId: image.imageId };

    await request(app).patch('/admin/home-image').send(body).expect(401);

    await request(app)
      .patch('/admin/home-image')
      .set('Authorization', 'Bearer not-a-valid-token')
      .send(body)
      .expect(401);

    // Mirrors MongoSessionStoreRepository.revoke()'s own update shape.
    await AuthSessionModel.findOneAndUpdate(
      { id: session.sessionId },
      { revokedAt: Date.now() },
    );

    const revoked = await selectHomeImage(session.accessToken, body).expect(
      401,
    );

    expectNoInternalData(revoked.body);
    await expect(readHomeImage()).resolves.toEqual({ image: null });
    await expect(HomeImageSettingModel.countDocuments()).resolves.toBe(0);
  });

  it('returns image null after the configured image is removed (AC-010, image removal path)', async () => {
    const { accessToken } = await login();
    const image = await createPublishedWorkWithImage(accessToken);

    await selectHomeImage(accessToken, {
      workId: image.workId,
      imageId: image.imageId,
    }).expect(200);

    await request(app)
      .delete(`/admin/works/${image.workId}/images/${image.imageId}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    await expect(readHomeImage()).resolves.toEqual({ image: null });
  });

  it('returns image null after the owning work is permanently removed (AC-010, work removal path)', async () => {
    const { accessToken } = await login();
    const image = await createPublishedWorkWithImage(accessToken);

    await selectHomeImage(accessToken, {
      workId: image.workId,
      imageId: image.imageId,
    }).expect(200);

    await request(app)
      .delete(`/admin/works/${image.workId}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    await expect(readHomeImage()).resolves.toEqual({ image: null });
  });

  it('returns image null when the work becomes a draft, and the image again once republished (AC-011)', async () => {
    const { accessToken } = await login();
    const image = await createPublishedWorkWithImage(accessToken);

    await selectHomeImage(accessToken, {
      workId: image.workId,
      imageId: image.imageId,
    }).expect(200);

    await request(app)
      .patch(`/admin/works/${image.workId}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ status: 'draft' })
      .expect(200);

    await expect(readHomeImage()).resolves.toEqual({ image: null });

    // Documented AD-002 residual behavior: republishing restores it.
    await request(app)
      .patch(`/admin/works/${image.workId}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ status: 'published' })
      .expect(200);

    await expect(readHomeImage()).resolves.toEqual({
      image: toHomeImage(image),
    });
  });

  it('returns image null when the work is logically removed (AC-010/AC-011, soft delete path)', async () => {
    const { accessToken } = await login();
    const image = await createPublishedWorkWithImage(accessToken);

    await selectHomeImage(accessToken, {
      workId: image.workId,
      imageId: image.imageId,
    }).expect(200);

    await new MongoWorkRepository().softDelete(image.workId);

    await expect(readHomeImage()).resolves.toEqual({ image: null });

    // A soft-deleted work cannot be selected again either (FR-009).
    await selectHomeImage(accessToken, {
      workId: image.workId,
      imageId: image.imageId,
    }).expect(404);
  });

  it('serves the same image from a fresh application instance, reading from MongoDB (AC-014)', async () => {
    const { accessToken } = await login();
    const image = await createPublishedWorkWithImage(accessToken);

    await selectHomeImage(accessToken, {
      workId: image.workId,
      imageId: image.imageId,
    }).expect(200);

    const persisted = await HomeImageSettingModel.findOne({}).lean();

    expect(persisted).toMatchObject({
      key: 'home',
      workId: image.workId,
      imageId: image.imageId,
    });

    const restartedApp = createApp({
      imageStorage: new FakeImageStorageAdapter(),
    });
    const response = await request(restartedApp).get('/home-image').expect(200);

    expect(response.body).toEqual({ image: toHomeImage(image) });
  });

  describe('OpenAPI document (AC-015)', () => {
    beforeEach(() => {
      process.env.ENABLE_SWAGGER = 'true';
      app = createApp({ imageStorage: new FakeImageStorageAdapter() });
    });

    afterEach(() => {
      delete process.env.ENABLE_SWAGGER;
    });

    it('documents GET /home-image and PATCH /admin/home-image in /docs.json', async () => {
      const response = await request(app).get('/docs.json').expect(200);
      const document = response.body as {
        paths: Record<
          string,
          Record<string, { responses: Record<string, unknown> }>
        >;
      };

      expect(Object.keys(document.paths['/home-image'].get.responses)).toEqual(
        expect.arrayContaining(['200', '429']),
      );
      expect(
        Object.keys(document.paths['/admin/home-image'].patch.responses),
      ).toEqual(
        expect.arrayContaining(['200', '400', '401', '404', '409', '429']),
      );
    });
  });
});
