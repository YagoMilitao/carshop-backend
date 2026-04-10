import express, { type Express } from 'express';
import { AuthService } from '../core/domain/application/Auth/auth.service';
import { EnvAdminCredentialsProvider } from './config/env-admin-credentials.provider';
import {
  registerBaseMiddlewares,
  registerTerminalMiddlewares,
} from './config/middleware';
import { registerRoutes } from './config/routes';
import { registerSwagger } from './swagger';
import { MongoSessionStoreRepository } from './repositories/mongo-session-store.repository';
import { JsonWebTokenService } from './services/jsonwebtoken-token.service';

/**
 * Cria e configura a aplicação Express.
 *
 * Este arquivo funciona como composition root da camada HTTP.
 */
export function createApp(): Express {
  const app = express();

  registerBaseMiddlewares(app);

  /**
   * Implementações concretas da infraestrutura.
   *
   * Agora a sessão é persistida em MongoDB,
   * o que torna a autenticação compatível com produção.
   */
  const sessionStore = new MongoSessionStoreRepository();
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
