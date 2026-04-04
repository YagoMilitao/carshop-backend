import cors from 'cors';
import express from 'express';
import swaggerUi from 'swagger-ui-express';
import { AuthService } from './modules/auth/application/services/auth.service';
import { openApiDocument } from './docs/openapi';
import { InMemorySessionStoreRepository } from './modules/auth/infrastructure/repositories/in-memory-session-store.repository';
import { EnvAdminCredentialsProvider } from './modules/auth/infrastructure/providers/env-admin-credentials.provider';
import { JsonWebTokenService } from './modules/auth/infrastructure/security/jsonwebtoken-token.service';
import { buildAuthRouter } from './modules/auth/interfaces/http/auth.routes';
import { errorHandlerMiddleware } from './shared/http/error-handler.middleware';
import { notFoundMiddleware } from './shared/http/not-found.middleware';

function getAllowedOrigins() {
  return process.env.CORS_ORIGIN?.split(',').map((value) => value.trim()) ?? [];
}

// Faz o wiring dos adapters da arquitetura hexagonal e devolve o app HTTP pronto.
export function createApp() {
  const app = express();
  const allowedOrigins = getAllowedOrigins();

  app.use(
    cors({
      origin: allowedOrigins.length ? allowedOrigins : false,
      credentials: true,
      methods: ['GET', 'POST', 'PATCH', 'DELETE'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-CSRF-Token'],
    }),
  );
  app.use(express.json());

  const sessionStore = new InMemorySessionStoreRepository();
  const tokenService = new JsonWebTokenService();
  const credentialsProvider = new EnvAdminCredentialsProvider();
  const authService = new AuthService(
    sessionStore,
    tokenService,
    credentialsProvider,
  );

  app.get('/', (_request, response) => {
    response.status(200).send('Hello World!');
  });
  app.get('/docs.json', (_request, response) => {
    response.status(200).json(openApiDocument);
  });
  app.use('/docs', swaggerUi.serve, swaggerUi.setup(openApiDocument));
  app.use('/auth', buildAuthRouter(authService, sessionStore, tokenService));

  app.use(notFoundMiddleware);
  app.use(errorHandlerMiddleware);

  return app;
}
