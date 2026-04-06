import cors from 'cors';
import express, { type Express } from 'express';
import { errorHandlerMiddleware } from '../presentation/middleware/error-handler.middleware';
import { notFoundMiddleware } from '../presentation/middleware/not-found.middleware';

function getAllowedOrigins() {
  return process.env.CORS_ORIGIN?.split(',').map((value) => value.trim()) ?? [];
}

export function registerBaseMiddlewares(app: Express) {
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
}

export function registerTerminalMiddlewares(app: Express) {
  app.use(notFoundMiddleware);
  app.use(errorHandlerMiddleware);
}
