import type { NextFunction, Request, Response } from 'express';
import { HttpError } from '../../core/domain/application/ApplicationError/http-error';
import { UploadWorkImageUseCase } from '../../usecase/upload-work-image.use-case';
import { DeleteWorkImageUseCase } from '../../usecase/delete-work-image.use-case';
import { requireStringRouteParam } from '../helpers/route-param.helper';
import { validateWithSchema } from '../../infra/presentation/helpers/zod-validation.helper';
import {
  UploadWorkImageBodyInput,
  uploadWorkImageBodySchema,
} from '../../infra/presentation/validators/upload-work-image-body.schema';

/**
 * Controller HTTP para imagens dos Works.
 *
 * Motivo:
 * adaptar upload multipart do Express para o use case.
 */
export class WorkImageController {
  constructor(
    private readonly uploadWorkImageUseCase: UploadWorkImageUseCase,
    private readonly deleteWorkImageUseCase: DeleteWorkImageUseCase,
  ) {}

  upload = async (
    request: Request<
      { workId: string },
      unknown,
      { alt?: unknown; isCover?: unknown }
    >,
    response: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const workId = request.params.workId;

      if (typeof workId !== 'string' || workId.trim().length === 0) {
        throw new HttpError(400, 'workId é obrigatório.');
      }

      if (!request.file) {
        throw new HttpError(400, 'Imagem é obrigatória.');
      }

      const body = validateWithSchema<UploadWorkImageBodyInput>(
        uploadWorkImageBodySchema,
        request.body,
      );

      const alt = body.alt ?? '';
      const isCover = body.isCover === 'true';

      await this.uploadWorkImageUseCase.execute({
        workId,
        filePath: request.file.path,
        mimeType: request.file.mimetype,
        originalName: request.file.originalname,
        alt,
        isCover,
      });

      response.status(201).json({
        message: 'Imagem adicionada com sucesso.',
      });
    } catch (error: unknown) {
      next(error);
    }
  };

  delete = async (
    request: Request<{ workId: string; imageId: string }>,
    response: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const workId = requireStringRouteParam(request.params.workId, 'workId');
      const imageId = requireStringRouteParam(
        request.params.imageId,
        'imageId',
      );

      const result = await this.deleteWorkImageUseCase.execute({
        workId,
        imageId,
      });

      response.status(200).json(result);
    } catch (error: unknown) {
      next(error);
    }
  };
}
