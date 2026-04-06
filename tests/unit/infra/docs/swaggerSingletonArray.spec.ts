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
  });

  it('contains security schemes used by auth endpoints', () => {
    expect(openApiDocument.components.securitySchemes.bearerAuth).toEqual({
      type: 'http',
      scheme: 'bearer',
      bearerFormat: 'JWT',
    });
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
