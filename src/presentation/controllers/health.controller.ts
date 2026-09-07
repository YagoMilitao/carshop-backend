import type { NextFunction, Request, Response } from 'express';
import { GetHealthStatusUseCase } from '../../usecase/get-health-status.use-case';

/**
 * Controller do endpoint público de health-check.
 *
 * Motivo:
 * expor `GET /health` de forma fina, delegando a regra de negócio ao
 * caso de uso e apenas mapeando o resultado para o status HTTP
 * correspondente (200 quando saudável, 503 quando degradado).
 */
export class HealthController {
  constructor(private readonly getHealthStatusUseCase: GetHealthStatusUseCase) {}

  check = async (
    _request: Request,
    response: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const result = this.getHealthStatusUseCase.execute();

      const statusCode = result.status === 'ok' ? 200 : 503;

      response.status(statusCode).json(result);
    } catch (error: unknown) {
      next(error);
    }
  };
}
