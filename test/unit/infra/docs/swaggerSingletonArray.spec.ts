import { openApiDocument } from '../../../../src/infra/docs/swaggerSingletonArray';

describe('openApiDocument', () => {
  it('exposes a valid OpenAPI base structure', () => {
    expect(openApiDocument.openapi).toBe('3.0.3');
    expect(openApiDocument.info.title).toBe('Carshop Backend API');
    expect(openApiDocument.info.version).toBe('1.0.0');
    expect(openApiDocument.tags).toEqual(
      expect.arrayContaining([{ name: 'Health' }, { name: 'Auth' }]),
    );
  });

  it('documents all public API routes', () => {
    expect(openApiDocument.paths['/']).toBeDefined();
    expect(openApiDocument.paths['/auth/login']).toBeDefined();
    expect(openApiDocument.paths['/auth/refresh']).toBeDefined();
    expect(openApiDocument.paths['/auth/logout']).toBeDefined();
    expect(openApiDocument.paths['/auth/session']).toBeDefined();
    expect(openApiDocument.paths['/works']).toBeDefined();
    expect(openApiDocument.paths['/works/{slug}']).toBeDefined();
  });

  // CARSHOP-37 / FR-005, NFR-003, AC-004: GET /health must be documented
  // with 200 (ok/connected) and 503 (degraded/disconnected) responses.
  it('documents GET /health with 200 and 503 responses (CARSHOP-37)', () => {
    const healthPath = openApiDocument.paths['/health'] as unknown as {
      get: {
        tags: string[];
        responses: Record<string, unknown>;
      };
    };

    expect(healthPath).toBeDefined();
    expect(healthPath.get).toBeDefined();
    expect(healthPath.get.tags).toContain('Health');
    expect(healthPath.get.responses['200']).toBeDefined();
    expect(healthPath.get.responses['503']).toBeDefined();
  });

  // CARSHOP-117 / FR-011, AC-006: GET /works/{slug} must be documented
  // with 200 and 404 responses, referencing the corrected WorkResponse
  // schema.
  it('documents GET /works/{slug} with 200 and 404 responses (AC-006)', () => {
    const workBySlugPath = openApiDocument.paths[
      '/works/{slug}'
    ] as unknown as {
      get: {
        responses: Record<string, unknown>;
        parameters: Array<{ name: string; in: string; required: boolean }>;
      };
    };

    expect(workBySlugPath.get).toBeDefined();
    expect(workBySlugPath.get.responses['200']).toBeDefined();
    expect(workBySlugPath.get.responses['404']).toBeDefined();
    expect(workBySlugPath.get.parameters).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: 'slug',
          in: 'path',
          required: true,
        }),
      ]),
    );
  });

  // CARSHOP-117 / FR-010, AC-006: WorkResponse schema must include
  // images, createdAt, updatedAt, and deletedAt, matching the real Work
  // shape returned by both GET /works and GET /works/{slug}.
  it('documents WorkResponse with images, createdAt, updatedAt and deletedAt (AC-006)', () => {
    const workResponseSchema = openApiDocument.components.schemas
      .WorkResponse as unknown as {
      properties: Record<string, { nullable?: boolean }>;
    };

    expect(workResponseSchema.properties.images).toBeDefined();
    expect(workResponseSchema.properties.createdAt).toBeDefined();
    expect(workResponseSchema.properties.updatedAt).toBeDefined();
    expect(workResponseSchema.properties.deletedAt).toBeDefined();
    expect(workResponseSchema.properties.deletedAt.nullable).toBe(true);
  });

  it('documents CommentResponse timestamps as required date-time fields', () => {
    const commentResponseSchema = openApiDocument.components.schemas
      .CommentResponse as unknown as {
      required: string[];
      properties: Record<string, { type: string; format?: string }>;
    };

    expect(commentResponseSchema.required).toEqual(
      expect.arrayContaining(['createdAt', 'updatedAt']),
    );
    expect(commentResponseSchema.properties.createdAt).toEqual({
      type: 'string',
      format: 'date-time',
    });
    expect(commentResponseSchema.properties.updatedAt).toEqual({
      type: 'string',
      format: 'date-time',
    });
  });

  it('documents the global 429 response for every operation', () => {
    const paths = openApiDocument.paths as unknown as Record<
      string,
      Record<string, { responses: Record<string, unknown> }>
    >;

    for (const operations of Object.values(paths)) {
      for (const operation of Object.values(operations)) {
        expect(operation.responses['429']).toBeDefined();
      }
    }
  });

  it('documents the current 500 response for image alt values over 160 characters', () => {
    const uploadImagePath = openApiDocument.paths[
      '/admin/works/{workId}/images'
    ] as unknown as {
      post: {
        responses: Record<string, { description: string }>;
      };
    };

    expect(uploadImagePath.post.responses['500'].description).toContain(
      'alt com mais de 160 caracteres',
    );
  });

  it('contains security schemes used by auth endpoints', () => {
    expect(openApiDocument.components.securitySchemes.bearerAuth).toMatchObject(
      {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
      },
    );
    expect(
      openApiDocument.components.securitySchemes.refreshTokenCookie,
    ).toEqual({
      type: 'apiKey',
      in: 'cookie',
      name: 'refresh_token',
    });
    expect(openApiDocument.components.securitySchemes.csrfTokenCookie).toEqual({
      type: 'apiKey',
      in: 'cookie',
      name: 'csrf_token',
    });
  });
});
