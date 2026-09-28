import type { NextFunction, Request, Response } from 'express';
import type { HomeImage } from '../../core/domain/application/HomeImage/home-image.types';
import type { GetHomeImageUseCase } from '../../usecase/get-home-image.use-case';
import type { SetHomeImageUseCase } from '../../usecase/set-home-image.use-case';
import { validateWithSchema } from '../../infra/presentation/helpers/zod-validation.helper';
import {
  type SetHomeImageSchemaInput,
  setHomeImageSchema,
} from '../../infra/presentation/validators/set-home-image.schema';

/**
 * Mapeia explicitamente a imagem da Home para o contrato HTTP.
 *
 * Motivo:
 * garantir que somente os campos documentados sejam expostos (NFR-003).
 */
function toHomeImageResponse(image: HomeImage | null): {
  image: HomeImage | null;
} {
  if (!image) {
    return { image: null };
  }

  return {
    image: {
      workId: image.workId,
      imageId: image.imageId,
      url: image.url,
      alt: image.alt,
    },
  };
}

/**
 * Controller HTTP da imagem principal da Home (CARSHOP-159).
 */
export class HomeImageController {
  constructor(
    private readonly getHomeImageUseCase: GetHomeImageUseCase,
    private readonly setHomeImageUseCase: SetHomeImageUseCase,
  ) {}

  get = async (
    _request: Request,
    response: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const image = await this.getHomeImageUseCase.execute();

      response.status(200).json(toHomeImageResponse(image));
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
      const body = validateWithSchema<SetHomeImageSchemaInput>(
        setHomeImageSchema,
        request.body,
      );

      const image = await this.setHomeImageUseCase.execute({
        workId: body.workId,
        imageId: body.imageId,
      });

      response.status(200).json(toHomeImageResponse(image));
    } catch (error: unknown) {
      next(error);
    }
  };
}
