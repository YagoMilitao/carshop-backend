const mockDelete = jest.fn();
const mockRouterInstance = {
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

import { buildAdminWorkRouter } from '../../../../../src/infra/http/routes/admin-work.routes';
import type { WorkRepositoryPort } from '../../../../../src/core/domain/repositories/work.repository';
import type { ImageStoragePort } from '../../../../../src/core/domain/application/Storage/image-storage.port';

describe('buildAdminWorkRouter', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('registers the hard delete route behind authMiddleware', () => {
    const workRepository = {} as WorkRepositoryPort;
    const imageStorage = {} as ImageStoragePort;
    const sessionStore = { name: 'session-store' } as never;
    const tokenService = { name: 'token-service' } as never;

    const router = buildAdminWorkRouter(
      workRepository,
      imageStorage,
      sessionStore,
      tokenService,
    );

    expect(router).toBe(mockRouterInstance);
    expect(mockBuildAuthMiddleware).toHaveBeenCalledWith(
      sessionStore,
      tokenService,
    );
    expect(mockDelete).toHaveBeenCalledWith(
      '/:workId',
      'auth-middleware',
      expect.any(Function),
    );
  });
});
