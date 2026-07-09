export const worksTags = [{ name: 'Works' }] as const;

export const worksSchemas = {
  WorkResponse: {
    type: 'object',
    properties: {
      id: { type: 'string' },
      slug: { type: 'string' },
      title: { type: 'string' },
      description: { type: 'string' },
      category: { type: 'string' },
      tags: {
        type: 'array',
        items: { type: 'string' },
      },
      status: {
        type: 'string',
        enum: ['draft', 'published'],
      },
    },
  },
} as const;

export const worksPaths = {
  '/works': {
    get: {
      tags: ['Works'],
      summary: 'Lista trabalhos publicados do portfólio',
      responses: {
        '200': {
          description: 'Lista de trabalhos publicados',
          content: {
            'application/json': {
              schema: {
                type: 'array',
                items: { $ref: '#/components/schemas/WorkResponse' },
              },
            },
          },
        },
      },
    },
  },
} as const;
