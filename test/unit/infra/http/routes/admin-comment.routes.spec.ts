const mockUse = jest.fn();
const mockPatch = jest.fn();
const mockDelete = jest.fn();
const mockRouterInstance = {
  use: mockUse,
  patch: mockPatch,
  delete: mockDelete,
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

import { buildAdminCommentRouter } from '../../../../../src/infra/http/routes/admin-comment.routes';
import type { CommentRepositoryPort } from '../../../../../src/core/domain/repositories/comment.repository';

describe('buildAdminCommentRouter', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('registers moderation routes behind authMiddleware', () => {
    const commentRepository = {} as CommentRepositoryPort;
    const sessionStore = { name: 'session-store' } as never;
    const tokenService = { name: 'token-service' } as never;

    const router = buildAdminCommentRouter(
      commentRepository,
      sessionStore,
      tokenService,
    );

    expect(router).toBe(mockRouterInstance);
    expect(mockBuildAuthMiddleware).toHaveBeenCalledWith(
      sessionStore,
      tokenService,
    );
    expect(mockUse).toHaveBeenCalledWith('auth-middleware');
    expect(mockPatch).toHaveBeenCalledWith(
      '/:commentId/approve',
      expect.any(Function),
    );
    expect(mockPatch).toHaveBeenCalledWith(
      '/:commentId',
      expect.any(Function),
    );
    expect(mockDelete).toHaveBeenCalledWith(
      '/:commentId',
      expect.any(Function),
    );
  });
});
