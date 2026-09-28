import { Router, type Router as ExpressRouter } from 'express';
import type { TokenServicePort } from '../../../core/domain/application/Auth/token-service.port';
import type { HomeImageSettingsRepositoryPort } from '../../../core/domain/repositories/home-image-settings.repository';
import type { SessionStorePort } from '../../../core/domain/repositories/session-store.repository';
import type { WorkRepositoryPort } from '../../../core/domain/repositories/work.repository';
import { HomeImageController } from '../../../presentation/controllers/home-image.controller';
import { GetHomeImageUseCase } from '../../../usecase/get-home-image.use-case';
import { SetHomeImageUseCase } from '../../../usecase/set-home-image.use-case';
import { buildAuthMiddleware } from '../../presentation/middleware/auth.middleware';

/**
 * Rota administrativa de seleção da imagem principal da Home (CARSHOP-159).
 *
 * Base:
 * PATCH /admin/home-image
 */
export function buildAdminHomeImageRouter(
  workRepository: WorkRepositoryPort,
  homeImageSettingsRepository: HomeImageSettingsRepositoryPort,
  sessionStore: SessionStorePort,
  tokenService: TokenServicePort,
): ExpressRouter {
  const router = Router();

  const authMiddleware = buildAuthMiddleware(sessionStore, tokenService);

  const controller = new HomeImageController(
    new GetHomeImageUseCase(workRepository, homeImageSettingsRepository),
    new SetHomeImageUseCase(workRepository, homeImageSettingsRepository),
  );

  router.patch('/', authMiddleware, controller.update);

  return router;
}
