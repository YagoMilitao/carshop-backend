const mockUse = jest.fn();
const mockGet = jest.fn();
const mockExpressJson = jest.fn(() => 'json-middleware');
const mockAppInstance = {
  use: mockUse,
  get: mockGet,
};

const mockExpressFactory = jest.fn(() => mockAppInstance);
(mockExpressFactory as unknown as { json: typeof mockExpressJson }).json =
  mockExpressJson;

const mockCorsMiddleware = 'cors-middleware';
const mockCorsFactory = jest.fn(() => mockCorsMiddleware);
const mockSwaggerServe = 'swagger-serve-middleware';
const mockSwaggerSetupMiddleware = 'swagger-setup-middleware';
const mockSwaggerSetup = jest.fn(() => mockSwaggerSetupMiddleware);
const mockAuthRouter = 'auth-router';
const mockBuildAuthRouter = jest.fn(() => mockAuthRouter);
const mockOpenApiDocument = { openapi: '3.0.3' };
const mockNotFoundMiddleware = 'not-found-middleware';
const mockErrorHandlerMiddleware = 'error-handler-middleware';

jest.mock('express', () => ({
  __esModule: true,
  default: mockExpressFactory,
}));

jest.mock('cors', () => ({
  __esModule: true,
  default: mockCorsFactory,
}));

jest.mock('swagger-ui-express', () => ({
  __esModule: true,
  default: {
    serve: mockSwaggerServe,
    setup: (document: unknown) =>
      (mockSwaggerSetup as unknown as (a: unknown) => unknown)(document),
  },
}));

jest.mock('../../../src/infra/docs/swaggerSingletonArray', () => ({
  openApiDocument: mockOpenApiDocument,
}));

jest.mock('../../../src/infra/http/routes/auth.routes', () => ({
  buildAuthRouter: (
    authService: unknown,
    sessionStore: unknown,
    tokenService: unknown,
  ) =>
    (
      mockBuildAuthRouter as unknown as (
        a: unknown,
        b: unknown,
        c: unknown,
      ) => unknown
    )(authService, sessionStore, tokenService),
}));

jest.mock(
  '../../../src/infra/presentation/middleware/not-found.middleware',
  () => ({
    notFoundMiddleware: mockNotFoundMiddleware,
  }),
);

jest.mock(
  '../../../src/infra/presentation/middleware/error-handler.middleware',
  () => ({
    errorHandlerMiddleware: mockErrorHandlerMiddleware,
  }),
);

import { createApp } from '../../../src/infra/server';

describe('createApp', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    jest.clearAllMocks();
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('wires middlewares and routes with default CORS origin=false', () => {
    delete process.env.CORS_ORIGIN;
    process.env.NODE_ENV = 'development';
    delete process.env.ENABLE_SWAGGER;

    const app = createApp();

    expect(app).toBe(mockAppInstance);
    expect(mockCorsFactory).toHaveBeenCalledWith({
      origin: false,
      credentials: true,
      methods: ['GET', 'POST', 'PATCH', 'DELETE'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-CSRF-Token'],
    });
    expect(mockExpressJson).toHaveBeenCalledTimes(1);
    expect(mockSwaggerSetup).toHaveBeenCalledWith(mockOpenApiDocument);
    expect(mockBuildAuthRouter).toHaveBeenCalledTimes(1);
    expect(mockUse).toHaveBeenNthCalledWith(1, mockCorsMiddleware);
    expect(mockUse).toHaveBeenNthCalledWith(2, 'json-middleware');
    expect(mockUse).toHaveBeenNthCalledWith(
      3,
      '/docs',
      mockSwaggerServe,
      mockSwaggerSetupMiddleware,
    );
    expect(mockUse).toHaveBeenNthCalledWith(4, '/auth', mockAuthRouter);
    expect(mockUse).toHaveBeenNthCalledWith(5, mockNotFoundMiddleware);
    expect(mockUse).toHaveBeenNthCalledWith(6, mockErrorHandlerMiddleware);
  });

  it('normalizes and forwards configured CORS origins', () => {
    process.env.CORS_ORIGIN =
      ' https://admin.carshop.com,https://app.carshop.com ';
    process.env.NODE_ENV = 'development';
    delete process.env.ENABLE_SWAGGER;

    createApp();

    expect(mockCorsFactory).toHaveBeenCalledWith(
      expect.objectContaining({
        origin: ['https://admin.carshop.com', 'https://app.carshop.com'],
      }),
    );
  });

  it('responds hello world in root route handler', () => {
    process.env.NODE_ENV = 'development';
    delete process.env.ENABLE_SWAGGER;
    createApp();

    const rootRouteCall = mockGet.mock.calls.find((call) => call[0] === '/');
    const rootHandler = rootRouteCall?.[1] as (
      request: unknown,
      response: { status: (code: number) => { send: (body: string) => void } },
    ) => void;
    const send = jest.fn();
    const response = {
      status: jest.fn(() => ({ send })),
    };

    rootHandler({}, response);

    expect(mockGet).toHaveBeenCalledWith('/', expect.any(Function));
    expect(response.status).toHaveBeenCalledWith(200);
    expect(send).toHaveBeenCalledWith('Hello World!');
  });

  it('responds openapi document in docs.json route handler', () => {
    process.env.NODE_ENV = 'development';
    delete process.env.ENABLE_SWAGGER;
    createApp();

    const docsRouteCall = mockGet.mock.calls.find(
      (call) => call[0] === '/docs.json',
    );
    const docsHandler = docsRouteCall?.[1] as (
      request: unknown,
      response: { status: (code: number) => { json: (body: unknown) => void } },
    ) => void;
    const json = jest.fn();
    const response = {
      status: jest.fn(() => ({ json })),
    };

    docsHandler({}, response);

    expect(mockGet).toHaveBeenCalledWith('/docs.json', expect.any(Function));
    expect(response.status).toHaveBeenCalledWith(200);
    expect(json).toHaveBeenCalledWith(mockOpenApiDocument);
  });

  it('does not expose swagger routes in production by default', () => {
    process.env.NODE_ENV = 'production';
    delete process.env.ENABLE_SWAGGER;

    createApp();

    const docsRouteCall = mockGet.mock.calls.find(
      (call) => call[0] === '/docs.json',
    );
    const docsUseCall = mockUse.mock.calls.find((call) => call[0] === '/docs');

    expect(mockSwaggerSetup).not.toHaveBeenCalled();
    expect(docsRouteCall).toBeUndefined();
    expect(docsUseCall).toBeUndefined();
  });

  it('allows enabling swagger explicitly in production', () => {
    process.env.NODE_ENV = 'production';
    process.env.ENABLE_SWAGGER = 'true';

    createApp();

    const docsRouteCall = mockGet.mock.calls.find(
      (call) => call[0] === '/docs.json',
    );
    const docsUseCall = mockUse.mock.calls.find((call) => call[0] === '/docs');

    expect(mockSwaggerSetup).toHaveBeenCalledWith(mockOpenApiDocument);
    expect(docsRouteCall).toBeDefined();
    expect(docsUseCall).toEqual([
      '/docs',
      mockSwaggerServe,
      mockSwaggerSetupMiddleware,
    ]);
  });

  it('allows disabling swagger explicitly outside production', () => {
    process.env.NODE_ENV = 'development';
    process.env.ENABLE_SWAGGER = 'false';

    createApp();

    const docsRouteCall = mockGet.mock.calls.find(
      (call) => call[0] === '/docs.json',
    );
    const docsUseCall = mockUse.mock.calls.find((call) => call[0] === '/docs');

    expect(mockSwaggerSetup).not.toHaveBeenCalled();
    expect(docsRouteCall).toBeUndefined();
    expect(docsUseCall).toBeUndefined();
  });
});
