import { Router, type Router as ExpressRouter } from 'express';
import type { WorkRepositoryPort } from '../../../core/domain/repositories/work.repository';
import type { ImageStoragePort } from '../../../core/domain/application/Storage/image-storage.port';
import type { SessionStorePort } from '../../../core/domain/repositories/session-store.repository';
import type { TokenServicePort } from '../../../core/domain/application/Auth/token-service.port';
import { buildAuthMiddleware } from '../../presentation/middleware/auth.middleware';

import { UploadWorkImageUseCase } from '../../../usecase/upload-work-image.use-case';
import { WorkImageController } from '../../../presentation/controllers/work-image.controller';
import { uploadMiddleware } from '@/infra/middleware/upload.middleware';

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

  const controller = new WorkImageController(uploadWorkImageUseCase);

  router.post(
    '/:workId/images',
    authMiddleware,
    uploadMiddleware.single('file'),
    controller.upload,
  );

  return router;
}
