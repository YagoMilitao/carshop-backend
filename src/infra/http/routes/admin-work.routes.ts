import { Router, type Router as ExpressRouter } from 'express';
import type { WorkRepositoryPort } from '../../../core/domain/repositories/work.repository';
import type { ImageStoragePort } from '../../../core/domain/application/Storage/image-storage.port';
import type { SessionStorePort } from '../../../core/domain/repositories/session-store.repository';
import type { TokenServicePort } from '../../../core/domain/application/Auth/token-service.port';
import { buildAuthMiddleware } from '../../presentation/middleware/auth.middleware';

import { HardDeleteWorkUseCase } from '../../../usecase/hard-delete-work.use-case';
import { AdminWorkController } from '../../../presentation/controllers/admin-work.controller';

/**
 * Rotas administrativas de Works.
 */
export function buildAdminWorkRouter(
  workRepository: WorkRepositoryPort,
  imageStorage: ImageStoragePort,
  sessionStore: SessionStorePort,
  tokenService: TokenServicePort,
): ExpressRouter {
  const router = Router();

  const authMiddleware = buildAuthMiddleware(sessionStore, tokenService);

  const hardDeleteWorkUseCase = new HardDeleteWorkUseCase(
    workRepository,
    imageStorage,
  );

  const controller = new AdminWorkController(hardDeleteWorkUseCase);

  router.delete('/:workId', authMiddleware, controller.hardDelete);

  return router;
}
