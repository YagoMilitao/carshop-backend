import type { NextFunction, Request, Response } from 'express';
import { HttpError } from '../../core/domain/application/ApplicationError/http-error';
import { UploadWorkImageUseCase } from '../../usecase/upload-work-image.use-case';

/**
 * Controller HTTP para imagens dos Works.
 *
 * Motivo:
 * adaptar upload multipart do Express para o use case.
 */
export class WorkImageController {
  constructor(
    private readonly uploadWorkImageUseCase: UploadWorkImageUseCase,
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

      const alt = typeof request.body.alt === 'string' ? request.body.alt : '';
      const isCover =
        typeof request.body.isCover === 'string' &&
        request.body.isCover === 'true';

      await this.uploadWorkImageUseCase.execute({
        workId,
        filePath: request.file.path,
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
}
