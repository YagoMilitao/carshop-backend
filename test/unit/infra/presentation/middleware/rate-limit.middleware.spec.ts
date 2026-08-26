import { globalRateLimitMiddleware } from '../../../../../src/infra/presentation/middleware/rate-limit.middleware';

describe('globalRateLimitMiddleware', () => {
  it('exporta um middleware Express (função) configurado', () => {
    expect(typeof globalRateLimitMiddleware).toBe('function');
    expect(globalRateLimitMiddleware).toHaveLength(3);
  });
});
