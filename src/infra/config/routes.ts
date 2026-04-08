import type { Express } from 'express';
import type { AuthService } from '../../core/domain/application/Auth/auth.service';
import type { TokenServicePort } from '../../core/domain/application/Auth/token-service.port';
import type { SessionStorePort } from '../../core/domain/repositories/session-store.repository';
import { buildAuthRouter } from '../http/routes/auth.routes';

/**
 * Dependências necessárias para registrar as rotas HTTP.
 *
 * Motivo:
 * deixar explícito tudo o que a camada HTTP precisa receber
 * da camada de composição/inicialização.
 */
interface RegisterRoutesDependencies {
  authService: AuthService;
  sessionStore: SessionStorePort;
  tokenService: TokenServicePort;
}

/**
 * Registra as rotas principais da aplicação.
 *
 * Motivo:
 * centralizar a composição das rotas em um único ponto.
 */
export function registerRoutes(
  app: Express,
  dependencies: RegisterRoutesDependencies,
): void {
  /**
   * Rota simples de teste/health inicial.
   *
   * Depois, se quiser, você pode trocar isso por /health.
   */
  app.get('/', (_request, response) => {
    response.status(200).send('Hello World!');
  });

  /**
   * Rotas de autenticação.
   */
  app.use(
    '/auth',
    buildAuthRouter(
      dependencies.authService,
      dependencies.sessionStore,
      dependencies.tokenService,
    ),
  );
}
