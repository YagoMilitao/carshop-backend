import type { NextFunction, Request, Response } from 'express';
import { ApproveCommentUseCase } from '../../usecase/approve-comment.use-case';
import { UpdateCommentUseCase } from '../../usecase/update-comment.use-case';
import { DeleteCommentUseCase } from '../../usecase/delete-comment.use-case';
import { validateWithSchema } from '@/infra/presentation/helpers/zod-validation.helper';
import {
  UpdateCommentInput,
  updateCommentSchema,
} from '@/infra/presentation/validators/update-comment.schema';
import { requireStringRouteParam } from '../helpers/route-param.helper';

/**
 * Controller HTTP da moderação de comentários.
 *
 * Motivo:
 * adaptar Express para os casos de uso administrativos.
 */
export class AdminCommentController {
  constructor(
    private readonly approveCommentUseCase: ApproveCommentUseCase,
    private readonly updateCommentUseCase: UpdateCommentUseCase,
    private readonly deleteCommentUseCase: DeleteCommentUseCase,
  ) {}

  approve = async (
    request: Request,
    response: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const commentId = requireStringRouteParam(
        request.params.commentId,
        'commentId',
      );

      const comment = await this.approveCommentUseCase.execute(commentId);

      response.status(200).json(comment);
    } catch (error: unknown) {
      next(error);
    }
  };

  update = async (
    request: Request,
    response: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const commentId = requireStringRouteParam(
        request.params.commentId,
        'commentId',
      );

      const body = validateWithSchema<UpdateCommentInput>(
        updateCommentSchema,
        request.body,
      );

      const updated = await this.updateCommentUseCase.execute(commentId, body);

      response.status(200).json(updated);
    } catch (error: unknown) {
      next(error);
    }
  };

  delete = async (
    request: Request,
    response: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const commentId = requireStringRouteParam(
        request.params.commentId,
        'commentId',
      );

      const result = await this.deleteCommentUseCase.execute(commentId);

      response.status(200).json(result);
    } catch (error: unknown) {
      next(error);
    }
  };
}
