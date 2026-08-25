import {
  Router,
  type NextFunction,
  type Request,
  type Response,
  type Router as ExpressRouter,
} from 'express';
import multer from 'multer';
import type { WorkRepositoryPort } from '../../../core/domain/repositories/work.repository';
import type { ImageStoragePort } from '../../../core/domain/application/Storage/image-storage.port';
import type { SessionStorePort } from '../../../core/domain/repositories/session-store.repository';
import type { TokenServicePort } from '../../../core/domain/application/Auth/token-service.port';
import { buildAuthMiddleware } from '../../presentation/middleware/auth.middleware';
import { HttpError } from '../../../core/domain/application/ApplicationError/http-error';

import { UploadWorkImageUseCase } from '../../../usecase/upload-work-image.use-case';
import { DeleteWorkImageUseCase } from '../../../usecase/delete-work-image.use-case';
import { WorkImageController } from '../../../presentation/controllers/work-image.controller';
import { uploadMiddleware } from '@/infra/middleware/upload.middleware';

/**
 * Traduz erros do Multer para o contrato HTTP já documentado no Swagger.
 *
 * Motivo:
 * manter o conhecimento específico do Multer isolado na camada de
 * infraestrutura/rotas, sem vazar para o error handler genérico
 * (`error-handler.middleware.ts`).
 */
function normalizeUploadError(
  error: unknown,
  _request: Request,
  _response: Response,
  next: NextFunction,
): void {
  if (!error) {
    next();
    return;
  }

  if (error instanceof HttpError) {
    next(error);
    return;
  }

  if (error instanceof multer.MulterError) {
    if (error.code === 'LIMIT_FILE_SIZE') {
      next(new HttpError(413, 'A imagem ultrapassa o limite de 5 MB.'));
      return;
    }

    next(new HttpError(400, 'Falha ao processar o upload da imagem.'));
    return;
  }

  if (error instanceof Error) {
    next(
      new HttpError(
        415,
        'Tipo de arquivo não suportado. Envie JPEG, PNG ou WebP.',
      ),
    );
    return;
  }

  next(error);
}

/**
 * Rotas administrativas de imagens dos works.
 */
export function buildWorkImageRouter(
  workRepository: WorkRepositoryPort,
  imageStorage: ImageStoragePort,
  sessionStore: SessionStorePort,
  tokenService: TokenServicePort,
): ExpressRouter {
  const router = Router();

  const authMiddleware = buildAuthMiddleware(sessionStore, tokenService);

  const uploadWorkImageUseCase = new UploadWorkImageUseCase(
    workRepository,
    imageStorage,
  );
  const deleteWorkImageUseCase = new DeleteWorkImageUseCase(
    workRepository,
    imageStorage,
  );

  const controller = new WorkImageController(
    uploadWorkImageUseCase,
    deleteWorkImageUseCase,
  );

  router.post(
    '/:workId/images',
    authMiddleware,
    uploadMiddleware.single('file'),
    normalizeUploadError,
    controller.upload,
  );

  router.delete('/:workId/images/:imageId', authMiddleware, controller.delete);

  return router;
}
