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
const mockAuthRouter = 'auth-router';
const mockBuildAuthRouter = jest.fn(() => mockAuthRouter);
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

jest.mock('../../src/modules/auth/interfaces/http/auth.routes', () => ({
  buildAuthRouter: (
    authService: unknown,
    sessionStore: unknown,
    tokenService: unknown,
  ) =>
    (mockBuildAuthRouter as unknown as (
      a: unknown,
      b: unknown,
      c: unknown,
    ) => unknown)(authService, sessionStore, tokenService),
}));

jest.mock('../../src/shared/http/not-found.middleware', () => ({
  notFoundMiddleware: mockNotFoundMiddleware,
}));

jest.mock('../../src/shared/http/error-handler.middleware', () => ({
  errorHandlerMiddleware: mockErrorHandlerMiddleware,
}));

import { createApp } from '../../src/app';

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

    const app = createApp();

    expect(app).toBe(mockAppInstance);
    expect(mockCorsFactory).toHaveBeenCalledWith({
      origin: false,
      credentials: true,
      methods: ['GET', 'POST', 'PATCH', 'DELETE'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-CSRF-Token'],
    });
    expect(mockExpressJson).toHaveBeenCalledTimes(1);
    expect(mockBuildAuthRouter).toHaveBeenCalledTimes(1);
    expect(mockUse).toHaveBeenNthCalledWith(1, mockCorsMiddleware);
    expect(mockUse).toHaveBeenNthCalledWith(2, 'json-middleware');
    expect(mockUse).toHaveBeenNthCalledWith(3, '/auth', mockAuthRouter);
    expect(mockUse).toHaveBeenNthCalledWith(4, mockNotFoundMiddleware);
    expect(mockUse).toHaveBeenNthCalledWith(5, mockErrorHandlerMiddleware);
  });

  it('normalizes and forwards configured CORS origins', () => {
    process.env.CORS_ORIGIN =
      ' https://admin.carshop.com,https://app.carshop.com ';

    createApp();

    expect(mockCorsFactory).toHaveBeenCalledWith(
      expect.objectContaining({
        origin: ['https://admin.carshop.com', 'https://app.carshop.com'],
      }),
    );
  });

  it('responds hello world in root route handler', () => {
    createApp();

    const rootHandler = mockGet.mock.calls[0][1] as (
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
});
