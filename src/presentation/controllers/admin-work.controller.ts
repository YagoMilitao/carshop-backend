import type { NextFunction, Request, Response } from 'express';
import { HardDeleteWorkUseCase } from '../../usecase/hard-delete-work.use-case';
import { requireStringRouteParam } from '../helpers/route-param.helper';

/**
 * Controller HTTP administrativo de Works.
 *
 * Motivo:
 * adaptar Express para os casos de uso administrativos de works.
 */
export class AdminWorkController {
  constructor(private readonly hardDeleteWorkUseCase: HardDeleteWorkUseCase) {}

  hardDelete = async (
    request: Request<{ workId: string }>,
    response: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const workId = requireStringRouteParam(request.params.workId, 'workId');

      const result = await this.hardDeleteWorkUseCase.execute(workId);

      response.status(200).json(result);
    } catch (error: unknown) {
      next(error);
    }
  };
}
