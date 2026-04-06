import { Router } from 'express';
import type { AuthService } from '../../../core/domain/application/Auth/auth.service';
import type { TokenServicePort } from '../../../core/domain/application/Auth/token-service.port';
import type { SessionStorePort } from '../../../core/domain/repositories/session-store.repository';
import { AuthController } from '../../../presentation/controllers/auth.controller';
import { buildAuthMiddleware } from '../../presentation/middleware/auth.middleware';
import { csrfProtectionMiddleware } from '../../presentation/middleware/csrf-protection.middleware';

// Define as rotas de autenticação e conecta cada rota ao adapter correspondente.
export function buildAuthRouter(
  authService: AuthService,
  sessionStore: SessionStorePort,
  tokenService: TokenServicePort,
) {
  const router = Router();
  const controller = new AuthController(authService);
  const authMiddleware = buildAuthMiddleware(sessionStore, tokenService);

  router.post('/login', controller.login);
  router.post('/refresh', csrfProtectionMiddleware, controller.refresh);
  router.post('/logout', csrfProtectionMiddleware, controller.logout);
  router.get('/session', authMiddleware, controller.getSession);

  return router;
}
