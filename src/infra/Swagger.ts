import type { Express } from 'express';
import swaggerUi from 'swagger-ui-express';
import { openApiDocument } from './docs/swaggerSingletonArray';

/**
 * Verifica se o Swagger deve ser disponibilizado.
 *
 * Em produção ele fica desabilitado por padrão,
 * a menos que ENABLE_SWAGGER=true.
 */
function isSwaggerEnabled(): boolean {
  if (typeof process.env.ENABLE_SWAGGER === 'string') {
    return process.env.ENABLE_SWAGGER === 'true';
  }

  return process.env.NODE_ENV !== 'production';
}

/**
 * Registra o JSON OpenAPI e a interface Swagger UI.
 */
export function registerSwagger(app: Express): void {
  if (!isSwaggerEnabled()) {
    return;
  }

  /**
   * Documento OpenAPI puro.
   *
   * Útil para ferramentas externas, geração de clientes
   * e inspeção da especificação.
   */
  app.get('/docs.json', (_request, response) => {
    response.status(200).json(openApiDocument);
  });

  /**
   * Interface interativa da documentação.
   */
  app.use(
    '/docs',
    swaggerUi.serve,
    swaggerUi.setup(openApiDocument, {
      swaggerOptions: {
        /**
         * Mantém o token preenchido quando a página é atualizada.
         *
         * Facilita testes manuais durante o desenvolvimento.
         */
        persistAuthorization: true,
      },
    }),
  );
}
