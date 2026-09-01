import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  jest,
} from '@jest/globals';

const originalEnv = process.env;

beforeAll(() => {
  process.env = {
    ...originalEnv,
    MONGO_URI: 'mongodb://unit-test',
    JWT_SECRET: 'unit-test-secret',
    ADMIN_EMAIL: 'admin@example.com',
    ADMIN_PASSWORD: 'unit-test-password',
    NODE_ENV: 'test',
  };
});

afterAll(() => {
  process.env = originalEnv;
});

const mockApp = { name: 'express-app', set: jest.fn() };
const mockSessionStore = { name: 'session-store' };
const mockWorkRepository = { name: 'work-repository' };
const mockCommentRepository = { name: 'comment-repository' };
const mockTokenService = { name: 'token-service' };
const mockCredentialsProvider = { name: 'credentials-provider' };
const mockImageStorage = { name: 'image-storage' };
const mockAuthService = { name: 'auth-service' };

const mockExpress = jest.fn(() => mockApp);
const mockMongoSessionStoreRepository = jest.fn(() => mockSessionStore);
const mockMongoWorkRepository = jest.fn(() => mockWorkRepository);
const mockMongoCommentRepository = jest.fn(() => mockCommentRepository);
const mockJsonWebTokenService = jest.fn(() => mockTokenService);
const mockEnvAdminCredentialsProvider = jest.fn(() => mockCredentialsProvider);
const mockCloudinaryStorageService = jest.fn(() => mockImageStorage);
const mockAuthServiceConstructor = jest.fn<
  (
    sessionStore: unknown,
    tokenService: unknown,
    credentialsProvider: unknown,
  ) => typeof mockAuthService
>(() => mockAuthService);
const mockRegisterBaseMiddlewares = jest.fn();
const mockRegisterSwagger = jest.fn();
const mockRegisterRoutes = jest.fn();
const mockRegisterTerminalMiddlewares = jest.fn();

jest.mock('express', () => ({
  __esModule: true,
  default: mockExpress,
}));

jest.mock('../../../src/core/domain/application/Auth/auth.service', () => ({
  AuthService: mockAuthServiceConstructor,
}));

jest.mock('../../../src/infra/config/env-admin-credentials.provider', () => ({
  EnvAdminCredentialsProvider: mockEnvAdminCredentialsProvider,
}));

jest.mock('../../../src/infra/config/middleware', () => ({
  registerBaseMiddlewares: mockRegisterBaseMiddlewares,
  registerTerminalMiddlewares: mockRegisterTerminalMiddlewares,
}));

jest.mock('../../../src/infra/config/routes', () => ({
  registerRoutes: mockRegisterRoutes,
}));

jest.mock(
  '../../../src/infra/repositories/mongo-session-store.repository',
  () => ({
    MongoSessionStoreRepository: mockMongoSessionStoreRepository,
  }),
);

jest.mock('../../../src/infra/repositories/mongo-work.repository', () => ({
  MongoWorkRepository: mockMongoWorkRepository,
}));

jest.mock('../../../src/infra/repositories/mongo-comment.repository', () => ({
  MongoCommentRepository: mockMongoCommentRepository,
}));

jest.mock('../../../src/infra/services/jsonwebtoken-token.service', () => ({
  JsonWebTokenService: mockJsonWebTokenService,
}));

jest.mock(
  '../../../src/infra/gateway/cloudinary/cloudinary-storage.service',
  () => ({
    CloudinaryStorageService: mockCloudinaryStorageService,
  }),
);

jest.mock('../../../src/infra/swagger', () => ({
  registerSwagger: mockRegisterSwagger,
}));

function loadCreateApp() {
  const module =
    require('../../../src/infra/server') as typeof import('../../../src/infra/server');

  return module.createApp;
}

describe('createApp', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('creates and returns the Express application', () => {
    const createApp = loadCreateApp();

    const app = createApp();

    expect(mockExpress).toHaveBeenCalledTimes(1);
    expect(app).toBe(mockApp);
  });

  it('creates the dependencies and registers the application layers', () => {
    const createApp = loadCreateApp();

    createApp();

    expect(mockMongoSessionStoreRepository).toHaveBeenCalledTimes(1);
    expect(mockMongoWorkRepository).toHaveBeenCalledTimes(1);
    expect(mockMongoCommentRepository).toHaveBeenCalledTimes(1);
    expect(mockJsonWebTokenService).toHaveBeenCalledTimes(1);
    expect(mockEnvAdminCredentialsProvider).toHaveBeenCalledTimes(1);
    expect(mockCloudinaryStorageService).toHaveBeenCalledTimes(1);
    expect(mockAuthServiceConstructor).toHaveBeenCalledWith(
      mockSessionStore,
      mockTokenService,
      mockCredentialsProvider,
    );

    expect(mockRegisterBaseMiddlewares).toHaveBeenCalledWith(mockApp);
    expect(mockRegisterSwagger).toHaveBeenCalledWith(mockApp);
    expect(mockRegisterRoutes).toHaveBeenCalledWith(mockApp, {
      authService: mockAuthService,
      sessionStore: mockSessionStore,
      tokenService: mockTokenService,
      workRepository: mockWorkRepository,
      commentRepository: mockCommentRepository,
      imageStorage: mockImageStorage,
    });
    expect(mockRegisterTerminalMiddlewares).toHaveBeenCalledWith(mockApp);
  });

  it('configures trust proxy before the base middlewares run', () => {
    const createApp = loadCreateApp();
    const { env } =
      require('../../../src/infra/config/env') as typeof import('../../../src/infra/config/env');

    createApp();

    expect(mockApp.set).toHaveBeenCalledWith('trust proxy', env.trustProxyHops);

    const trustProxyOrder = mockApp.set.mock.invocationCallOrder[0];
    const baseMiddlewaresOrder =
      mockRegisterBaseMiddlewares.mock.invocationCallOrder[0];

    expect(trustProxyOrder).toBeLessThan(baseMiddlewaresOrder);
  });

  it('registers terminal middlewares after Swagger and routes', () => {
    const createApp = loadCreateApp();

    createApp();

    const baseOrder = mockRegisterBaseMiddlewares.mock.invocationCallOrder[0];
    const swaggerOrder = mockRegisterSwagger.mock.invocationCallOrder[0];
    const routesOrder = mockRegisterRoutes.mock.invocationCallOrder[0];
    const terminalOrder =
      mockRegisterTerminalMiddlewares.mock.invocationCallOrder[0];

    expect(baseOrder).toBeLessThan(swaggerOrder);
    expect(swaggerOrder).toBeLessThan(routesOrder);
    expect(routesOrder).toBeLessThan(terminalOrder);
  });

  it('constructs CloudinaryStorageService when no overrides are supplied', () => {
    const createApp = loadCreateApp();

    createApp();

    expect(mockCloudinaryStorageService).toHaveBeenCalledTimes(1);
    expect(mockRegisterRoutes).toHaveBeenCalledWith(
      mockApp,
      expect.objectContaining({ imageStorage: mockImageStorage }),
    );
  });

  it('uses the supplied imageStorage override instead of constructing CloudinaryStorageService', () => {
    const createApp = loadCreateApp();
    const overrideImageStorage = { name: 'fake-image-storage' };

    createApp({ imageStorage: overrideImageStorage as never });

    expect(mockCloudinaryStorageService).not.toHaveBeenCalled();
    expect(mockRegisterRoutes).toHaveBeenCalledWith(mockApp, {
      authService: mockAuthService,
      sessionStore: mockSessionStore,
      tokenService: mockTokenService,
      workRepository: mockWorkRepository,
      commentRepository: mockCommentRepository,
      imageStorage: overrideImageStorage,
    });
  });
});
