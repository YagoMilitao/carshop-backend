import type { Express } from 'express';
import swaggerUi from 'swagger-ui-express';
import { openApiDocument } from './docs/swaggerSingletonArray';

function isSwaggerEnabled(): boolean {
  if (typeof process.env.ENABLE_SWAGGER === 'string') {
    return process.env.ENABLE_SWAGGER === 'true';
  }

  return process.env.NODE_ENV !== 'production';
}

export function registerSwagger(app: Express): void {
  if (!isSwaggerEnabled()) {
    return;
  }

  app.get('/docs.json', (_request, response) => {
    response.status(200).json(openApiDocument);
  });

  app.use(
    '/docs',
    swaggerUi.serve,
    swaggerUi.setup(openApiDocument, {
      swaggerOptions: {
        persistAuthorization: true,
      },
    }),
  );
}
