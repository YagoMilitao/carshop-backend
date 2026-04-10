import type { Express } from 'express';
import express from 'express';
import cors, { type CorsOptions } from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';

import { env } from './env';
import { globalRateLimitMiddleware } from '../presentation/middleware/rate-limit.middleware';
import { notFoundMiddleware } from '../presentation/middleware/not-found.middleware';
import { errorHandlerMiddleware } from '../presentation/middleware/error-handler.middleware';

/**
 * Cria a configuração do CORS com validação dinâmica.
 *
 * Motivo:
 * permitir múltiplas origens seguras e bloquear acessos indevidos.
 */
function buildCorsOptions(): CorsOptions {
  return {
    origin: (origin, callback) => {
      /**
       * Permite chamadas sem origin, como Postman/curl/testes.
       */
      if (!origin) {
        return callback(null, true);
      }

      if (env.corsOrigins.includes(origin)) {
        return callback(null, true);
      }

      return callback(new Error(`CORS bloqueado para origin: ${origin}`));
    },
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-CSRF-Token'],
  };
}

/**
 * Registra middlewares base da aplicação.
 */
export function registerBaseMiddlewares(app: Express): void {
  app.use(helmet());
  app.use(cors(buildCorsOptions()));
  app.use(globalRateLimitMiddleware);

  app.use(
    express.json({
      limit: '1mb',
    }),
  );

  app.use(morgan(env.nodeEnv === 'production' ? 'combined' : 'dev'));
}

/**
 * Registra middlewares terminais.
 */
export function registerTerminalMiddlewares(app: Express): void {
  app.use(notFoundMiddleware);
  app.use(errorHandlerMiddleware);
}
