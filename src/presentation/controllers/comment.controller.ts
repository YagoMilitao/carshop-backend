import type { NextFunction, Request, Response } from 'express';
import { CreateCommentUseCase } from '../../usecase/create-comment.use-case';
import { ListApprovedCommentsUseCase } from '../../usecase/list-approved-comments.use-case';
import { requireStringRouteParam } from '../helpers/route-param.helper';
import { validateWithSchema } from '../../infra/presentation/helpers/zod-validation.helper';
import {
  CreateCommentInput,
  createCommentSchema,
} from '../../infra/presentation/validators/comment.schema';

/**
 * Controller HTTP dos comentários.
 *
 * Motivo:
 * adaptar requisição/resposta do Express para casos de uso.
 */
export class CommentController {
  constructor(
    private readonly createCommentUseCase: CreateCommentUseCase,
    private readonly listApprovedCommentsUseCase: ListApprovedCommentsUseCase,
  ) {}

  create = async (
    request: Request,
    response: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const workId = requireStringRouteParam(request.params.workId, 'workId');

      const body = validateWithSchema<CreateCommentInput>(
        createCommentSchema,
        request.body,
      );

      const comment = await this.createCommentUseCase.execute({
        workId,
        authorName: body.authorName,
        content: body.content,
      });

      response.status(201).json(comment);
    } catch (error: unknown) {
      next(error);
    }
  };

  listApproved = async (
    request: Request,
    response: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const workId = requireStringRouteParam(request.params.workId, 'workId');

      const comments = await this.listApprovedCommentsUseCase.execute(workId);

      response.status(200).json(comments);
    } catch (error: unknown) {
      next(error);
    }
  };
}
