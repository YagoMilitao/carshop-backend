import type { NextFunction, Request, Response } from 'express';
import { CreateWorkUseCase } from '../../usecase/create-work.use-case';
import { ListWorksUseCase } from '../../usecase/list-works.use-case';
import { GetWorkBySlugUseCase } from '../../usecase/get-work-by-slug.use-case';
import { requireStringRouteParam } from '../helpers/route-param.helper';
import { validateWithSchema } from '../../infra/presentation/helpers/zod-validation.helper';
import {
  CreateWorkSchemaInput,
  createWorkSchema,
} from '../../infra/presentation/validators/create-work.schema';

export class WorkController {
  constructor(
    private readonly createWorkUseCase: CreateWorkUseCase,
    private readonly listWorksUseCase: ListWorksUseCase,
    private readonly getWorkBySlugUseCase: GetWorkBySlugUseCase,
  ) {}

  create = async (
    request: Request,
    response: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const body = validateWithSchema<CreateWorkSchemaInput>(
        createWorkSchema,
        request.body,
      );

      const work = await this.createWorkUseCase.execute({
        slug: body.slug,
        title: body.title,
        description: body.description,
        category: body.category,
        tags: body.tags,
        status: body.status,
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

  getBySlug = async (
    request: Request,
    response: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const slug = requireStringRouteParam(request.params.slug, 'slug');

      const work = await this.getWorkBySlugUseCase.execute(slug);

      response.status(200).json(work);
    } catch (error: unknown) {
      next(error);
    }
  };
}
