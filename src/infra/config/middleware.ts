import type { Express } from 'express';
import express from 'express';
import cors, { type CorsOptions } from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import { env } from './env';
import { globalRateLimitMiddleware } from '../presentation/middleware/rate-limit.middleware';
import { errorHandlerMiddleware } from '../presentation/middleware/error-handler.middleware';
import { notFoundMiddleware } from '../presentation/middleware/not-found.middleware';

/**
 * Retorna a lista de origens permitidas com base no .env.
 *
 * Exemplo:
 * CORS_ORIGIN=http://localhost:3000,https://meusite.com
 *
 * Motivo:
 * - permitir múltiplos ambientes
 * - evitar hardcode
 * - manter flexibilidade
 */
function getAllowedOrigins(): string[] {
  const raw = process.env.CORS_ORIGIN;

  if (!raw) {
    return [];
  }

  return raw
    .split(',')
    .map((value) => value.trim())
    .filter((value) => value.length > 0);
}

/**
 * Cria configuração robusta de CORS.
 *
 * Motivo:
 * - controlar exatamente quem pode acessar a API
 * - evitar comportamento imprevisível
 * - melhorar segurança em produção
 */
function buildCorsOptions(): CorsOptions {
  const allowedOrigins = getAllowedOrigins();

  return {
    origin: (origin, callback) => {
      /**
       * Caso 1: requisição sem origin (Postman, curl, testes)
       * Permitimos, pois não é browser.
       */
      if (!origin) {
        return callback(null, true);
      }

      /**
       * Caso 2: origin permitido
       */
      if (allowedOrigins.includes(origin)) {
        return callback(null, true);
      }

      /**
       * Caso 3: origin bloqueado
       *
       * Motivo:
       * - impedir acesso indevido via browser
       * - evitar consumo externo não autorizado
       */
      return callback(new Error(`CORS bloqueado para origin: ${origin}`));
    },

    credentials: true,

    methods: ['GET', 'POST', 'PATCH', 'DELETE'],

    allowedHeaders: ['Content-Type', 'Authorization', 'X-CSRF-Token'],
  };
}

/**
 * Registra os middlewares base da aplicação.
 *
 * Ordem importa:
 * 1. Segurança (helmet)
 * 2. CORS
 * 3. Rate limit
 * 4. Body parser
 * 5. Logs
 */
export function registerBaseMiddlewares(app: Express): void {
  /**
   * helmet:
   * adiciona headers HTTP de segurança automaticamente.
   */
  app.use(helmet());

  /**
   * CORS:
   * controla quais origens podem acessar a API via browser.
   */
  app.use(cors(buildCorsOptions()));

  /**
   * Rate limit global:
   * protege contra flood, brute force e abuso.
   */
  app.use(globalRateLimitMiddleware);

  /**
   * Body parser:
   * permite receber JSON no corpo das requisições.
   *
   * limit:
   * evita payloads muito grandes.
   */
  app.use(
    express.json({
      limit: '1mb',
    }),
  );

  /**
   * Logger HTTP:
   * exibe logs das requisições no terminal.
   *
   * Em produção usamos formato mais detalhado.
   */
  app.use(morgan(env.nodeEnv === 'production' ? 'combined' : 'dev'));
}

/**
 * Registra middlewares terminais.
 *
 * Ordem correta:
 * 1. 404 (quando nenhuma rota respondeu)
 * 2. error handler (captura erros globais)
 */
export function registerTerminalMiddlewares(app: Express): void {
  /**
   * Middleware de rota não encontrada.
   */
  app.use(notFoundMiddleware);

  /**
   * Middleware global de erro.
   */
  app.use(errorHandlerMiddleware);
}
