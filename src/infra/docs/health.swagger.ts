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
      },
    },
  },
} as const;
