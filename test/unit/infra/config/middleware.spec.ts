import type { Express } from 'express';

const originalEnv = process.env;

process.env = {
  ...originalEnv,
  MONGO_URI: 'mongodb://unit-test',
  JWT_SECRET: 'unit-test-secret',
  ADMIN_EMAIL: 'admin@example.com',
  ADMIN_PASSWORD: 'unit-test-password',
  NODE_ENV: 'test',
  CORS_ORIGIN: 'https://allowed.example.com',
};

type CorsOptions = {
  origin: (
    origin: string | undefined,
    callback: (error: Error | null, allow?: boolean) => void,
  ) => void;
};

const mockCors = jest.fn((options: CorsOptions) => {
  return (): CorsOptions => options;
});

jest.mock('cors', () => ({
  __esModule: true,
  default: (options: CorsOptions) =>
    (mockCors as unknown as (o: CorsOptions) => unknown)(options),
}));

import {
  registerBaseMiddlewares,
  registerTerminalMiddlewares,
} from '../../../../src/infra/config/middleware';

function createAppMock(): jest.Mocked<Express> {
  return {
    use: jest.fn(),
  } as unknown as jest.Mocked<Express>;
}

describe('registerBaseMiddlewares', () => {
  afterAll(() => {
    process.env = originalEnv;
  });

  it('registers helmet, cors, rate limit, json parser and morgan', () => {
    const app = createAppMock();

    registerBaseMiddlewares(app);

    expect(app.use).toHaveBeenCalledTimes(5);
    expect(mockCors).toHaveBeenCalledWith(
      expect.objectContaining({
        credentials: true,
        methods: ['GET', 'POST', 'PATCH', 'DELETE'],
        allowedHeaders: ['Content-Type', 'Authorization', 'X-CSRF-Token'],
      }),
    );
  });

  it('allows requests without an origin header (e.g. curl/Postman)', () => {
    const app = createAppMock();
    registerBaseMiddlewares(app);

    const corsOptions = mockCors.mock.calls[0][0];
    const callback = jest.fn();

    corsOptions.origin(undefined, callback);

    expect(callback).toHaveBeenCalledWith(null, true);
  });

  it('allows requests from a configured CORS origin', () => {
    const app = createAppMock();
    registerBaseMiddlewares(app);

    const corsOptions = mockCors.mock.calls[0][0];
    const callback = jest.fn();

    corsOptions.origin('https://allowed.example.com', callback);

    expect(callback).toHaveBeenCalledWith(null, true);
  });

  it('blocks requests from a non-configured origin', () => {
    const app = createAppMock();
    registerBaseMiddlewares(app);

    const corsOptions = mockCors.mock.calls[0][0];
    const callback = jest.fn();

    corsOptions.origin('https://blocked.example.com', callback);

    expect(callback).toHaveBeenCalledWith(expect.any(Error));
    const [error] = callback.mock.calls[0];
    expect((error as Error).message).toBe(
      'CORS bloqueado para origin: https://blocked.example.com',
    );
  });
});

describe('registerTerminalMiddlewares', () => {
  it('registers the not-found and error-handler middlewares', () => {
    const app = createAppMock();

    registerTerminalMiddlewares(app);

    expect(app.use).toHaveBeenCalledTimes(2);
  });
});
