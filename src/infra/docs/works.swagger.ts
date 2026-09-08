import {
  bearerSecurity,
  errorResponse,
  globalRateLimitResponse,
  successResponse,
} from './swagger.helpers';

export const worksTags = [{ name: 'Works' }] as const;

export const worksSchemas = {
  CreateWorkRequest: {
    type: 'object',
    required: ['slug', 'title', 'description', 'category'],
    properties: {
      slug: { type: 'string', example: 'honda-civic-2020' },
      title: { type: 'string', example: 'Honda Civic 2020' },
      description: {
        type: 'string',
        example: 'Restauração completa do banco em couro.',
      },
      category: { type: 'string', example: 'bancos' },
      tags: {
        type: 'array',
        items: { type: 'string' },
        default: [],
        example: ['couro', 'restauração'],
      },
      status: {
        type: 'string',
        enum: ['draft', 'published'],
        default: 'draft',
      },
    },
  },

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
      images: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            url: { type: 'string' },
            publicId: { type: 'string' },
            alt: { type: 'string' },
            isCover: { type: 'boolean' },
            order: { type: 'number' },
            createdAt: { type: 'string', format: 'date-time' },
            updatedAt: { type: 'string', format: 'date-time' },
          },
        },
      },
      status: {
        type: 'string',
        enum: ['draft', 'published'],
      },
      createdAt: { type: 'string', format: 'date-time' },
      updatedAt: { type: 'string', format: 'date-time' },
      deletedAt: {
        type: 'string',
        format: 'date-time',
        nullable: true,
      },
    },
  },
} as const;

export const worksPaths = {
  '/works': {
    get: {
      tags: ['Works'],
      summary: 'Lista trabalhos publicados do portfólio',
      description:
        'Por padrão retorna apenas trabalhos publicados, sem exigir autenticação. Quando includeDrafts=true é informado, exige um access token Bearer válido vinculado a uma sessão ativa e passa a incluir também os trabalhos em rascunho.',
      /**
       * Alternativa dupla: sem autenticação (comportamento padrão) ou
       * com bearerAuth (necessário quando includeDrafts=true).
       */
      security: [{}, { bearerAuth: [] }],
      parameters: [
        {
          in: 'query',
          name: 'includeDrafts',
          required: false,
          schema: { type: 'boolean', default: false },
          description:
            'Quando true, inclui trabalhos em rascunho na resposta. Requer autenticação de administrador; caso contrário a resposta é 401.',
        },
      ],
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
        '401': errorResponse(
          'Access token ausente, inválido ou sessão expirada ao solicitar includeDrafts=true.',
        ),
        '429': globalRateLimitResponse,
      },
    },
    post: {
      tags: ['Works'],
      summary: 'Cria um novo trabalho',
      description:
        'Endpoint privado. Exige um access token Bearer válido vinculado a uma sessão ativa.',
      security: bearerSecurity,
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/CreateWorkRequest' },
          },
        },
      },
      responses: {
        '201': successResponse(
          'Trabalho criado com sucesso',
          '#/components/schemas/WorkResponse',
        ),
        '400': errorResponse('Payload inválido.'),
        '401': errorResponse(
          'Access token ausente, inválido ou sessão expirada.',
        ),
        '409': errorResponse('Já existe um trabalho com o slug informado.'),
        '429': globalRateLimitResponse,
      },
    },
  },
  '/works/{slug}': {
    get: {
      tags: ['Works'],
      summary: 'Busca um trabalho publicado pelo slug',
      description:
        'Endpoint público, sem exigência de autenticação. Retorna um único trabalho quando o slug corresponde a um trabalho com status published e não removido (deletedAt nulo); caso contrário responde 404, mesmo para trabalhos em rascunho ou removidos logicamente.',
      security: [{}],
      parameters: [
        {
          in: 'path',
          name: 'slug',
          required: true,
          schema: { type: 'string' },
          description: 'Slug identificador do trabalho.',
        },
      ],
      responses: {
        '200': successResponse(
          'Trabalho encontrado',
          '#/components/schemas/WorkResponse',
        ),
        '404': errorResponse(
          'Nenhum trabalho publicado e não removido foi encontrado para o slug informado.',
        ),
        '429': globalRateLimitResponse,
      },
    },
  },
} as const;
