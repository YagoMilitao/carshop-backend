import type { Response } from 'express';
import { notFoundMiddleware } from '../../../../../src/infra/presentation/middleware/not-found.middleware';

describe('notFoundMiddleware', () => {
  it('returns the default 404 payload', () => {
    const response = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    } as unknown as Response;

    notFoundMiddleware({} as never, response, jest.fn());

    expect(response.status).toHaveBeenCalledWith(404);
    expect(response.json).toHaveBeenCalledWith({
      message: 'Rota não encontrada.',
    });
  });
});
