const mockGet = jest.fn();
const mockPatch = jest.fn();
const mockRouterInstance = { get: mockGet, patch: mockPatch };
const mockRouterFactory = jest.fn(() => mockRouterInstance);

jest.mock('express', () => ({
  Router: mockRouterFactory,
}));

import { buildHomeImageRouter } from '../../../../../src/infra/http/routes/home-image.routes';
import type { WorkRepositoryPort } from '../../../../../src/core/domain/repositories/work.repository';
import type { HomeImageSettingsRepositoryPort } from '../../../../../src/core/domain/repositories/home-image-settings.repository';

/**
 * CARSHOP-159 — FR-003: GET /home-image is public (no auth middleware).
 */
describe('buildHomeImageRouter (CARSHOP-159)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('registers only the public GET handler, without authentication middleware', () => {
    const router = buildHomeImageRouter(
      {} as WorkRepositoryPort,
      {} as HomeImageSettingsRepositoryPort,
    );

    expect(router).toBe(mockRouterInstance);
    expect(mockGet).toHaveBeenCalledTimes(1);
    expect(mockGet).toHaveBeenCalledWith('/', expect.any(Function));
    expect(mockPatch).not.toHaveBeenCalled();
  });
});
