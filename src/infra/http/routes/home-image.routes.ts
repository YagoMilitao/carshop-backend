import { Router, type Router as ExpressRouter } from 'express';
import type { HomeImageSettingsRepositoryPort } from '../../../core/domain/repositories/home-image-settings.repository';
import type { WorkRepositoryPort } from '../../../core/domain/repositories/work.repository';
import { HomeImageController } from '../../../presentation/controllers/home-image.controller';
import { GetHomeImageUseCase } from '../../../usecase/get-home-image.use-case';
import { SetHomeImageUseCase } from '../../../usecase/set-home-image.use-case';

/**
 * Rota pública de leitura da imagem principal da Home (CARSHOP-159).
 *
 * Base:
 * GET /home-image
 */
export function buildHomeImageRouter(
  workRepository: WorkRepositoryPort,
  homeImageSettingsRepository: HomeImageSettingsRepositoryPort,
): ExpressRouter {
  const router = Router();

  const controller = new HomeImageController(
    new GetHomeImageUseCase(workRepository, homeImageSettingsRepository),
    new SetHomeImageUseCase(workRepository, homeImageSettingsRepository),
  );

  router.get('/', controller.get);

  return router;
}
