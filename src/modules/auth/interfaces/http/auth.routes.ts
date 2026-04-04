import { Router } from 'express';
import type { AuthService } from '../../application/services/auth.service';
import type { SessionStorePort } from '../../domain/ports/session-store.port';
import type { TokenServicePort } from '../../domain/ports/token-service.port';
import { AuthController } from './auth.controller';
import { buildAuthMiddleware } from './middlewares/auth.middleware';
import { csrfProtectionMiddleware } from './middlewares/csrf-protection.middleware';

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
