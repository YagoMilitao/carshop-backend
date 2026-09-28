const mockGet = jest.fn();
const mockPatch = jest.fn();
const mockRouterInstance = { get: mockGet, patch: mockPatch };
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

import { buildAdminHomeImageRouter } from '../../../../../src/infra/http/routes/admin-home-image.routes';
import type { WorkRepositoryPort } from '../../../../../src/core/domain/repositories/work.repository';
import type { HomeImageSettingsRepositoryPort } from '../../../../../src/core/domain/repositories/home-image-settings.repository';

/**
 * CARSHOP-159 — NFR-001/AC-009: PATCH /admin/home-image sits behind the
 * existing authMiddleware.
 */
describe('buildAdminHomeImageRouter (CARSHOP-159)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('registers PATCH / with authMiddleware before the handler, built from the injected session store and token service', () => {
    const sessionStore = { name: 'session-store' } as never;
    const tokenService = { name: 'token-service' } as never;

    const router = buildAdminHomeImageRouter(
      {} as WorkRepositoryPort,
      {} as HomeImageSettingsRepositoryPort,
      sessionStore,
      tokenService,
    );

    expect(router).toBe(mockRouterInstance);
    expect(mockBuildAuthMiddleware).toHaveBeenCalledWith(
      sessionStore,
      tokenService,
    );
    expect(mockPatch).toHaveBeenCalledTimes(1);
    expect(mockPatch).toHaveBeenCalledWith(
      '/',
      'auth-middleware',
      expect.any(Function),
    );
    expect(mockGet).not.toHaveBeenCalled();
  });
});
