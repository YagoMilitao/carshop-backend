import {
  errorResponse,
  globalRateLimitResponse,
  successResponse,
} from './swagger.helpers';

export const commentsTags = [{ name: 'Comments' }] as const;

export const commentsSchemas = {
  CommentRequest: {
    type: 'object',
    required: ['authorName', 'content'],
    properties: {
      authorName: {
        type: 'string',
        minLength: 2,
        maxLength: 80,
        example: 'Yago',
        description:
          'Não pode conter marcação HTML ou conteúdo de script (ex.: tags, atributos de evento ou URIs javascript:); submissões com esse conteúdo são rejeitadas.',
      },
      content: {
        type: 'string',
        minLength: 3,
        maxLength: 1000,
        example: 'Ficou muito bom esse trabalho.',
        description:
          'Não pode conter marcação HTML ou conteúdo de script (ex.: tags, atributos de evento ou URIs javascript:); submissões com esse conteúdo são rejeitadas.',
      },
    },
  },

  CommentResponse: {
    type: 'object',
    required: [
      'id',
      'workId',
      'authorName',
      'content',
      'status',
      'createdAt',
      'updatedAt',
    ],
    properties: {
      id: { type: 'string' },
      workId: { type: 'string' },
      authorName: { type: 'string' },
      content: { type: 'string' },
      status: {
        type: 'string',
        enum: ['PENDING', 'APPROVED'],
      },
      createdAt: { type: 'string', format: 'date-time' },
      updatedAt: { type: 'string', format: 'date-time' },
    },
  },
} as const;

export const commentsPaths = {
  '/works/{workId}/comments': {
    get: {
      tags: ['Comments'],
      summary: 'Lista comentários aprovados de um trabalho',
      parameters: [
        {
          in: 'path',
          name: 'workId',
          required: true,
          schema: { type: 'string' },
        },
      ],
      responses: {
        '200': {
          description: 'Lista de comentários aprovados',
          content: {
            'application/json': {
              schema: {
                type: 'array',
                items: { $ref: '#/components/schemas/CommentResponse' },
              },
            },
          },
        },
        '404': errorResponse('Trabalho não encontrado'),
        '429': globalRateLimitResponse,
      },
    },

    post: {
      tags: ['Comments'],
      summary: 'Cria comentário público pendente',
      parameters: [
        {
          in: 'path',
          name: 'workId',
          required: true,
          schema: { type: 'string' },
        },
      ],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/CommentRequest' },
          },
        },
      },
      responses: {
        '201': successResponse(
          'Comentário criado com status PENDING',
          '#/components/schemas/CommentResponse',
        ),
        '400': errorResponse('Payload inválido'),
        '404': errorResponse('Trabalho não encontrado'),
        '429': errorResponse(
          'Limite global (100 requisições por IP em 15 minutos) ou limite dedicado de comentários (10 requisições por IP em 10 minutos) excedido.',
        ),
      },
    },
  },
} as const;
