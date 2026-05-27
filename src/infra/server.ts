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
import { JsonWebTokenService } from './services/jsonwebtoken-token.service';
import { MongoCommentRepository } from './repositories/mongo-comment.repository';

/**
 * Cria e configura a aplicação Express.
 *
 * Este arquivo funciona como composition root da camada HTTP.
 *
 * Motivo:
 * é aqui que ligamos as implementações concretas
 * da infraestrutura com os contratos e serviços da aplicação.
 */
export function createApp(): Express {
  const app = express();

  /**
   * Registra middlewares base:
   * - segurança
   * - CORS
   * - rate limit
   * - JSON parser
   * - logs
   */
  registerBaseMiddlewares(app);

  /**
   * Implementações concretas da infraestrutura.
   *
   * sessionStore:
   *   persiste as sessões no MongoDB.
   *
   * workRepository:
   *   persiste e consulta os trabalhos do portfólio.
   *
   * tokenService:
   *   gera e valida JWT.
   *
   * credentialsProvider:
   *   lê credenciais do admin via ambiente.
   */
  const sessionStore = new MongoSessionStoreRepository();
  const workRepository = new MongoWorkRepository();
  const commentRepository = new MongoCommentRepository();
  const tokenService = new JsonWebTokenService();
  const credentialsProvider = new EnvAdminCredentialsProvider();

  /**
   * Serviço principal da autenticação.
   *
   * Motivo:
   * concentra a regra de negócio de login, refresh, logout e sessão.
   */
  const authService = new AuthService(
    sessionStore,
    tokenService,
    credentialsProvider,
  );

  /**
   * Registra Swagger antes das rotas,
   * para expor a documentação da API.
   */
  registerSwagger(app);

  /**
   * Registra todas as rotas da aplicação.
   */
  registerRoutes(app, {
    authService,
    sessionStore,
    tokenService,
    workRepository,
    commentRepository,
  });

  /**
   * Middlewares terminais:
   * - 404
   * - tratamento global de erro
   */
  registerTerminalMiddlewares(app);

  return app;
}
