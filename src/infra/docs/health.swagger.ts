import { globalRateLimitResponse } from './swagger.helpers';

export const healthTags = [{ name: 'Health' }] as const;

export const healthPaths = {
  '/': {
    get: {
      tags: ['Health'],
      summary: 'Health check da API',
      responses: {
        '200': {
          description: 'Servidor operacional',
          content: {
            'text/plain': {
              schema: {
                type: 'string',
                example: 'Hello World!',
              },
            },
          },
        },
        '429': globalRateLimitResponse,
      },
    },
  },
  '/health': {
    get: {
      tags: ['Health'],
      summary:
        'Health check detalhado, usado pela plataforma de deploy (Render) para liveness e conectividade com o MongoDB',
      security: [],
      responses: {
        '200': {
          description: 'Serviço operacional e conectado ao banco de dados',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  status: { type: 'string', example: 'ok' },
                  database: { type: 'string', example: 'connected' },
                },
              },
            },
          },
        },
        '429': globalRateLimitResponse,
        '503': {
          description: 'Serviço degradado (sem conexão com o banco de dados)',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  status: { type: 'string', example: 'degraded' },
                  database: { type: 'string', example: 'disconnected' },
                },
              },
            },
          },
        },
      },
    },
  },
} as const;
