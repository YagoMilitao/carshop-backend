import { Router, type Router as ExpressRouter } from 'express';
import type { AuthService } from '../../../core/domain/application/Auth/auth.service';
import type { TokenServicePort } from '../../../core/domain/application/Auth/token-service.port';
import type { SessionStorePort } from '../../../core/domain/repositories/session-store.repository';
import { AuthController } from '../../../presentation/controllers/auth.controller';
import { buildAuthMiddleware } from '../../presentation/middleware/auth.middleware';
import { csrfProtectionMiddleware } from '../../presentation/middleware/csrf-protection.middleware';

/**
 * Define as rotas de autenticação e conecta cada rota
 * aos adapters HTTP correspondentes.
 *
 * Motivo:
 * isolar a composição das rotas de auth em um único módulo
 * e manter o registerRoutes mais limpo.
 */
export function buildAuthRouter(
  authService: AuthService,
  sessionStore: SessionStorePort,
  tokenService: TokenServicePort,
): ExpressRouter {
  const router = Router();
  const controller = new AuthController(authService);

  /**
   * Middleware que protege rotas que exigem access token válido.
   */
  const authMiddleware = buildAuthMiddleware(sessionStore, tokenService);

  /**
   * Login do admin.
   *
   * Não exige auth prévia nem CSRF,
   * porque ainda não existe sessão autenticada.
   */
  router.post('/login', controller.login);

  /**
   * Refresh do access token.
   *
   * Exige validação CSRF porque depende de cookies
   * e renova a sessão autenticada.
   */
  router.post('/refresh', csrfProtectionMiddleware, controller.refresh);

  /**
   * Logout da sessão atual.
   *
   * Também exige validação CSRF porque atua sobre
   * a sessão autenticada via cookies.
   */
  router.post('/logout', csrfProtectionMiddleware, controller.logout);

  /**
   * Consulta da sessão autenticada atual.
   *
   * Exige access token válido no header Authorization.
   */
  router.get('/session', authMiddleware, controller.getSession);

  return router;
}
