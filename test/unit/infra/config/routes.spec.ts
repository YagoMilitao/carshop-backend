import type { Express, Request, Response } from 'express';
import type { AuthService } from '../../../../src/core/domain/application/Auth/auth.service';
import type { TokenServicePort } from '../../../../src/core/domain/application/Auth/token-service.port';
import type { ImageStoragePort } from '../../../../src/core/domain/application/Storage/image-storage.port';
import type { SessionStorePort } from '../../../../src/core/domain/repositories/session-store.repository';
import type { WorkRepositoryPort } from '../../../../src/core/domain/repositories/work.repository';
import type { CommentRepositoryPort } from '../../../../src/core/domain/repositories/comment.repository';

const mockAuthRouter = { name: 'auth-router' };
const mockWorkRouter = { name: 'work-router' };
const mockAdminCommentRouter = { name: 'admin-comment-router' };
const mockWorkImageRouter = { name: 'work-image-router' };
const mockAdminWorkRouter = { name: 'admin-work-router' };

const mockBuildAuthRouter = jest.fn(() => mockAuthRouter);
const mockBuildWorkRouter = jest.fn(() => mockWorkRouter);
const mockBuildAdminCommentRouter = jest.fn(() => mockAdminCommentRouter);
const mockBuildWorkImageRouter = jest.fn(() => mockWorkImageRouter);
const mockBuildAdminWorkRouter = jest.fn(() => mockAdminWorkRouter);

jest.mock('../../../../src/infra/http/routes/auth.routes', () => ({
  buildAuthRouter: (...args: unknown[]) =>
    (mockBuildAuthRouter as unknown as (...a: unknown[]) => unknown)(...args),
}));
jest.mock('../../../../src/infra/http/routes/work.routes', () => ({
  buildWorkRouter: (...args: unknown[]) =>
    (mockBuildWorkRouter as unknown as (...a: unknown[]) => unknown)(...args),
}));
jest.mock('../../../../src/infra/http/routes/admin-comment.routes', () => ({
  buildAdminCommentRouter: (...args: unknown[]) =>
    (
      mockBuildAdminCommentRouter as unknown as (...a: unknown[]) => unknown
    )(...args),
}));
jest.mock('../../../../src/infra/http/routes/work-image.routes', () => ({
  buildWorkImageRouter: (...args: unknown[]) =>
    (
      mockBuildWorkImageRouter as unknown as (...a: unknown[]) => unknown
    )(...args),
}));
jest.mock('../../../../src/infra/http/routes/admin-work.routes', () => ({
  buildAdminWorkRouter: (...args: unknown[]) =>
    (
      mockBuildAdminWorkRouter as unknown as (...a: unknown[]) => unknown
    )(...args),
}));

import { registerRoutes } from '../../../../src/infra/config/routes';

function createAppMock() {
  return {
    get: jest.fn(),
    use: jest.fn(),
  } as unknown as jest.Mocked<Express>;
}

describe('registerRoutes', () => {
  const authService = { name: 'auth-service' } as unknown as AuthService;
  const sessionStore = { name: 'session-store' } as unknown as SessionStorePort;
  const tokenService = { name: 'token-service' } as unknown as TokenServicePort;
  const workRepository = {} as WorkRepositoryPort;
  const commentRepository = {} as CommentRepositoryPort;
  const imageStorage = {} as ImageStoragePort;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('registers the health check endpoint', () => {
    const app = createAppMock();

    registerRoutes(app, {
      authService,
      sessionStore,
      tokenService,
      workRepository,
      commentRepository,
      imageStorage,
    });

    expect(app.get).toHaveBeenCalledWith('/', expect.any(Function));

    const healthCheckHandler = app.get.mock.calls[0][1] as (
      request: Request,
      response: Response,
    ) => void;
    const response = {
      status: jest.fn().mockReturnThis(),
      send: jest.fn(),
    } as unknown as Response;

    healthCheckHandler({} as Request, response);

    expect(response.status).toHaveBeenCalledWith(200);
    expect(response.send).toHaveBeenCalledWith('Hello World!');
  });

  it('wires each feature router with its dependencies at the expected base path', () => {
    const app = createAppMock();

    registerRoutes(app, {
      authService,
      sessionStore,
      tokenService,
      workRepository,
      commentRepository,
      imageStorage,
    });

    expect(mockBuildAuthRouter).toHaveBeenCalledWith(
      authService,
      sessionStore,
      tokenService,
    );
    expect(app.use).toHaveBeenCalledWith('/auth', mockAuthRouter);

    expect(mockBuildWorkRouter).toHaveBeenCalledWith(
      workRepository,
      commentRepository,
      sessionStore,
      tokenService,
    );
    expect(app.use).toHaveBeenCalledWith('/works', mockWorkRouter);

    expect(mockBuildAdminCommentRouter).toHaveBeenCalledWith(
      commentRepository,
      sessionStore,
      tokenService,
    );
    expect(app.use).toHaveBeenCalledWith(
      '/admin/comments',
      mockAdminCommentRouter,
    );

    expect(mockBuildWorkImageRouter).toHaveBeenCalledWith(
      workRepository,
      imageStorage,
      sessionStore,
      tokenService,
    );
    expect(mockBuildAdminWorkRouter).toHaveBeenCalledWith(
      workRepository,
      imageStorage,
      sessionStore,
      tokenService,
    );
    expect(app.use).toHaveBeenCalledWith('/admin/works', mockWorkImageRouter);
    expect(app.use).toHaveBeenCalledWith('/admin/works', mockAdminWorkRouter);
  });
});
