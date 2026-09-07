import type { NextFunction, Request, Response } from 'express';
import { HealthController } from '../../../../src/presentation/controllers/health.controller';
import type { GetHealthStatusUseCase } from '../../../../src/usecase/get-health-status.use-case';

describe('HealthController', () => {
  const buildResponse = (): jest.Mocked<Response> =>
    ({
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
    }) as unknown as jest.Mocked<Response>;

  it('responds with 200 and the JSON body when status is ok', async () => {
    const useCase = {
      execute: jest.fn().mockReturnValue({
        status: 'ok',
        database: 'connected',
      }),
    } as unknown as jest.Mocked<GetHealthStatusUseCase>;
    const controller = new HealthController(useCase);
    const response = buildResponse();
    const next = jest.fn() as NextFunction;

    await controller.check({} as Request, response, next);

    expect(response.status).toHaveBeenCalledWith(200);
    expect(response.json).toHaveBeenCalledWith({
      status: 'ok',
      database: 'connected',
    });
    expect(next).not.toHaveBeenCalled();
  });

  it('responds with 503 and the JSON body when status is degraded', async () => {
    const useCase = {
      execute: jest.fn().mockReturnValue({
        status: 'degraded',
        database: 'disconnected',
      }),
    } as unknown as jest.Mocked<GetHealthStatusUseCase>;
    const controller = new HealthController(useCase);
    const response = buildResponse();
    const next = jest.fn() as NextFunction;

    await controller.check({} as Request, response, next);

    expect(response.status).toHaveBeenCalledWith(503);
    expect(response.json).toHaveBeenCalledWith({
      status: 'degraded',
      database: 'disconnected',
    });
    expect(next).not.toHaveBeenCalled();
  });

  it('forwards errors to next() when the use case throws', async () => {
    const thrownError = new Error('unexpected failure');
    const useCase = {
      execute: jest.fn().mockImplementation(() => {
        throw thrownError;
      }),
    } as unknown as jest.Mocked<GetHealthStatusUseCase>;
    const controller = new HealthController(useCase);
    const response = buildResponse();
    const next = jest.fn() as NextFunction;

    await controller.check({} as Request, response, next);

    expect(next).toHaveBeenCalledWith(thrownError);
    expect(response.status).not.toHaveBeenCalled();
  });
});
