import type { Express } from 'express';
import type { AuthService } from '../../core/domain/application/Auth/auth.service';
import type { TokenServicePort } from '../../core/domain/application/Auth/token-service.port';
import type { SessionStorePort } from '../../core/domain/repositories/session-store.repository';
import { buildAuthRouter } from '../http/routes/auth.routes';

interface HttpRouteDependencies {
  authService: AuthService;
  sessionStore: SessionStorePort;
  tokenService: TokenServicePort;
}

export function registerRoutes(
  app: Express,
  dependencies: HttpRouteDependencies,
) {
  app.get('/', (_request, response) => {
    response.status(200).send('Hello World!');
  });

  app.use(
    '/auth',
    buildAuthRouter(
      dependencies.authService,
      dependencies.sessionStore,
      dependencies.tokenService,
    ),
  );
}
