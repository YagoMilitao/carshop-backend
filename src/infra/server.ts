import express from 'express';
import { AuthService } from '../core/domain/application/Auth/auth.service';
import { EnvAdminCredentialsProvider } from './config/env-admin-credentials.provider';
import {
  registerBaseMiddlewares,
  registerTerminalMiddlewares,
} from './config/middleware';
import { registerRoutes } from './config/routes';
import { registerSwagger } from './Swagger';
import { InMemorySessionStoreRepository } from './repositories/in-memory-session-store.repository';
import { JsonWebTokenService } from './services/jsonwebtoken-token.service';

// Faz o wiring dos adapters da arquitetura hexagonal e devolve o app HTTP pronto.
export function createApp() {
  const app = express();
  registerBaseMiddlewares(app);

  const sessionStore = new InMemorySessionStoreRepository();
  const tokenService = new JsonWebTokenService();
  const credentialsProvider = new EnvAdminCredentialsProvider();
  const authService = new AuthService(
    sessionStore,
    tokenService,
    credentialsProvider,
  );

  registerSwagger(app);
  registerRoutes(app, {
    authService,
    sessionStore,
    tokenService,
  });
  registerTerminalMiddlewares(app);

  return app;
}
