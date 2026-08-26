const mockGet = jest.fn();
const mockPost = jest.fn();
const mockRouterInstance = {
  get: mockGet,
  post: mockPost,
};
const mockRouterFactory = jest.fn(() => mockRouterInstance);

const mockBuildAuthMiddleware = jest.fn(() => 'auth-middleware');

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

import { buildWorkRouter } from '../../../../../src/infra/http/routes/work.routes';
import type { WorkRepositoryPort } from '../../../../../src/core/domain/repositories/work.repository';
import type { CommentRepositoryPort } from '../../../../../src/core/domain/repositories/comment.repository';

describe('buildWorkRouter', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('registers public and authenticated routes for works and comments', () => {
    const workRepository = {} as WorkRepositoryPort;
    const commentRepository = {} as CommentRepositoryPort;
    const sessionStore = { name: 'session-store' } as never;
    const tokenService = { name: 'token-service' } as never;

    const router = buildWorkRouter(
      workRepository,
      commentRepository,
      sessionStore,
      tokenService,
    );

    expect(router).toBe(mockRouterInstance);
    expect(mockBuildAuthMiddleware).toHaveBeenCalledWith(
      sessionStore,
      tokenService,
    );

    expect(mockGet).toHaveBeenCalledWith('/', expect.any(Function));
    expect(mockPost).toHaveBeenCalledWith(
      '/',
      'auth-middleware',
      expect.any(Function),
    );
    expect(mockPost).toHaveBeenCalledWith(
      '/:workId/comments',
      expect.any(Function),
    );
    expect(mockGet).toHaveBeenCalledWith(
      '/:workId/comments',
      expect.any(Function),
    );
  });
});
