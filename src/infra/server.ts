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
import { MongoWorkRepository } from './repositories/mongo-work.repository';
import { MongoCommentRepository } from './repositories/mongo-comment.repository';
import { JsonWebTokenService } from './services/jsonwebtoken-token.service';
import { CloudinaryStorageService } from './gateway/cloudinary/cloudinary-storage.service';

/**
 * Cria e configura a aplicação Express.
 *
 * Motivo:
 * este arquivo é o composition root da aplicação.
 * Aqui conectamos implementações concretas da infraestrutura
 * aos serviços e rotas da aplicação.
 */
export function createApp(): Express {
  const app = express();

  /**
   * Middlewares globais:
   * CORS, JSON parser, rate limit, logs, segurança etc.
   */
  registerBaseMiddlewares(app);

  /**
   * Repositories concretos.
   */
  const sessionStore = new MongoSessionStoreRepository();
  const workRepository = new MongoWorkRepository();
  const commentRepository = new MongoCommentRepository();

  /**
   * Serviços concretos da infraestrutura.
   */
  const tokenService = new JsonWebTokenService();
  const credentialsProvider = new EnvAdminCredentialsProvider();
  const imageStorage = new CloudinaryStorageService();

  /**
   * Serviço de autenticação da aplicação.
   */
  const authService = new AuthService(
    sessionStore,
    tokenService,
    credentialsProvider,
  );

  /**
   * Documentação Swagger.
   */
  registerSwagger(app);

  /**
   * Rotas da aplicação.
   */
  registerRoutes(app, {
    authService,
    sessionStore,
    tokenService,
    workRepository,
    commentRepository,
    imageStorage,
  });

  /**
   * Middlewares finais:
   * 404 e error handler.
   */
  registerTerminalMiddlewares(app);

  return app;
}
