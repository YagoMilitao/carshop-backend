import type { NextFunction, Request, Response } from 'express';
import { HttpError } from '../../core/domain/application/ApplicationError/http-error';
import { CreateWorkUseCase } from '../../usecase/create-work.use-case';
import { ListWorksUseCase } from '../../usecase/list-works.use-case';

type CreateWorkPayload = {
  slug?: string;
  title?: string;
  description?: string;
  category?: string;
  tags?: string[];
  status?: 'draft' | 'published';
};

export class WorkController {
  constructor(
    private readonly createWorkUseCase: CreateWorkUseCase,
    private readonly listWorksUseCase: ListWorksUseCase,
  ) {}

  create = async (
    request: Request,
    response: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const body = request.body as CreateWorkPayload;

      if (
        typeof body.slug !== 'string' ||
        typeof body.title !== 'string' ||
        typeof body.description !== 'string' ||
        typeof body.category !== 'string'
      ) {
        throw new HttpError(400, 'Payload inválido para criação de trabalho.');
      }

      const work = await this.createWorkUseCase.execute({
        slug: body.slug,
        title: body.title,
        description: body.description,
        category: body.category,
        tags: Array.isArray(body.tags) ? body.tags : [],
        status: body.status ?? 'draft',
      });

      response.status(201).json(work);
    } catch (error: unknown) {
      next(error);
    }
  };

  list = async (
    request: Request,
    response: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const includeDrafts = request.query.includeDrafts === 'true';

      const works = await this.listWorksUseCase.execute({
        includeDrafts,
      });

      response.status(200).json(works);
    } catch (error: unknown) {
      next(error);
    }
  };
}
