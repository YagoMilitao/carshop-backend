import express, { type Express } from 'express';
import { AuthService } from '../core/domain/application/Auth/auth.service';
import { EnvAdminCredentialsProvider } from './config/env-admin-credentials.provider';
import {
  registerBaseMiddlewares,
  registerTerminalMiddlewares,
} from './config/middleware';
import { registerRoutes } from './config/routes';
import { registerSwagger } from './swagger';
import { InMemorySessionStoreRepository } from './repositories/in-memory-session-store.repository';
import { JsonWebTokenService } from './services/jsonwebtoken-token.service';

/**
 * Cria e configura a aplicação Express.
 *
 * Este arquivo funciona como o composition root da camada HTTP:
 * aqui conectamos as implementações concretas da infraestrutura
 * aos serviços da aplicação.
 */
export function createApp(): Express {
  const app = express();

  // Middlewares base entram no começo da pipeline.
  registerBaseMiddlewares(app);

  /**
   * Dependências concretas da autenticação.
   *
   * Elas são instanciadas aqui porque a camada de infraestrutura
   * é a responsável por decidir "como" os contratos serão implementados.
   */
  const sessionStore = new InMemorySessionStoreRepository();
  const tokenService = new JsonWebTokenService();
  const credentialsProvider = new EnvAdminCredentialsProvider();

  /**
   * Serviço de autenticação da camada de aplicação.
   *
   * Repare que ele recebe dependências já prontas,
   * mantendo a lógica de negócio desacoplada da infraestrutura.
   */
  const authService = new AuthService(
    sessionStore,
    tokenService,
    credentialsProvider,
  );

  // Swagger é registrado antes das rotas para expor a documentação.
  registerSwagger(app);

  // Rotas recebem as dependências que precisam para funcionar.
  registerRoutes(app, {
    authService,
    sessionStore,
    tokenService,
  });

  // Middlewares terminais ficam no final.
  registerTerminalMiddlewares(app);

  return app;
}
