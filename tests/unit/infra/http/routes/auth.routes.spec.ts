const mockPost = jest.fn();
const mockGet = jest.fn();
const mockRouterInstance = {
  post: mockPost,
  get: mockGet,
};
const mockRouterFactory = jest.fn(() => mockRouterInstance);

const mockBuildAuthMiddleware = jest.fn(() => 'auth-middleware');
const mockCsrfProtectionMiddleware = 'csrf-middleware';
const mockController = {
  login: 'login-handler',
  refresh: 'refresh-handler',
  logout: 'logout-handler',
  getSession: 'session-handler',
};
const mockAuthControllerFactory = jest.fn(() => mockController);

jest.mock('express', () => ({
  Router: mockRouterFactory,
}));

jest.mock(
  '../../../../../src/infra/presentation/middleware/auth.middleware',
  () => ({
    buildAuthMiddleware: (sessionStore: unknown, tokenService: unknown) =>
      (
        mockBuildAuthMiddleware as unknown as (
          a: unknown,
          b: unknown,
        ) => unknown
      )(sessionStore, tokenService),
  }),
);

jest.mock(
  '../../../../../src/infra/presentation/middleware/csrf-protection.middleware',
  () => ({
    csrfProtectionMiddleware: mockCsrfProtectionMiddleware,
  }),
);

jest.mock(
  '../../../../../src/presentation/controllers/auth.controller',
  () => ({
    AuthController: function MockAuthController(authService: unknown) {
      return (mockAuthControllerFactory as unknown as (a: unknown) => unknown)(
        authService,
      );
    },
  }),
);

import { buildAuthRouter } from '../../../../../src/infra/http/routes/auth.routes';

describe('buildAuthRouter', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('registers all expected auth routes and middlewares', () => {
    const authService = { name: 'auth-service' } as never;
    const sessionStore = { name: 'session-store' } as never;
    const tokenService = { name: 'token-service' } as never;

    const router = buildAuthRouter(authService, sessionStore, tokenService);

    expect(router).toBe(mockRouterInstance);
    expect(mockRouterFactory).toHaveBeenCalledTimes(1);
    expect(mockAuthControllerFactory).toHaveBeenCalledWith(authService);
    expect(mockBuildAuthMiddleware).toHaveBeenCalledWith(
      sessionStore,
      tokenService,
    );
    expect(mockPost).toHaveBeenNthCalledWith(1, '/login', 'login-handler');
    expect(mockPost).toHaveBeenNthCalledWith(
      2,
      '/refresh',
      mockCsrfProtectionMiddleware,
      'refresh-handler',
    );
    expect(mockPost).toHaveBeenNthCalledWith(
      3,
      '/logout',
      mockCsrfProtectionMiddleware,
      'logout-handler',
    );
    expect(mockGet).toHaveBeenCalledWith(
      '/session',
      'auth-middleware',
      'session-handler',
    );
  });
});
