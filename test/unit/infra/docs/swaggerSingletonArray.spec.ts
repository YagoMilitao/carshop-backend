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
