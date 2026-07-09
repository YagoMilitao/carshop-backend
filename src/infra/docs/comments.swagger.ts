import { errorResponse, successResponse } from './swagger.helpers';

export const commentsTags = [{ name: 'Comments' }] as const;

export const commentsSchemas = {
  CommentRequest: {
    type: 'object',
    required: ['authorName', 'content'],
    properties: {
      authorName: { type: 'string', example: 'Yago' },
      content: {
        type: 'string',
        example: 'Ficou muito bom esse trabalho.',
      },
    },
  },

  CommentResponse: {
    type: 'object',
    properties: {
      id: { type: 'string' },
      workId: { type: 'string' },
      authorName: { type: 'string' },
      content: { type: 'string' },
      status: {
        type: 'string',
        enum: ['PENDING', 'APPROVED'],
      },
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
      },
    },
  },
} as const;
