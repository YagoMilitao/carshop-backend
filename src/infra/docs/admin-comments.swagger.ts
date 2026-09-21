import {
  bearerSecurity,
  errorResponse,
  globalRateLimitResponse,
  successResponse,
} from './swagger.helpers';

/**
 * Tag usada para agrupar as rotas administrativas
 * de moderação de comentários no Swagger.
 */
export const adminCommentsTags = [
  {
    name: 'Admin Comments',
    description: 'Moderação administrativa de comentários.',
  },
] as const;

/**
 * Schemas específicos da moderação.
 */
export const adminCommentsSchemas = {
  UpdateCommentRequest: {
    type: 'object',
    minProperties: 1,
    properties: {
      authorName: {
        type: 'string',
        minLength: 2,
        maxLength: 80,
        example: 'Visitante',
      },
      content: {
        type: 'string',
        minLength: 3,
        maxLength: 1000,
        example: 'Comentário revisado pelo administrador.',
      },
      status: {
        type: 'string',
        enum: ['PENDING', 'APPROVED'],
        example: 'APPROVED',
      },
    },
  },

  DeleteCommentResponse: {
    type: 'object',
    required: ['success'],
    properties: {
      success: {
        type: 'boolean',
        example: true,
      },
    },
  },

  AdminCommentListResponse: {
    type: 'object',
    required: ['items', 'page', 'limit', 'total', 'totalPages'],
    properties: {
      items: {
        type: 'array',
        items: { $ref: '#/components/schemas/CommentResponse' },
      },
      page: { type: 'integer', minimum: 1, example: 1 },
      limit: { type: 'integer', minimum: 1, maximum: 100, example: 20 },
      total: { type: 'integer', minimum: 0, example: 1 },
      totalPages: { type: 'integer', minimum: 1, example: 1 },
    },
  },
} as const;

/**
 * Rotas administrativas de comentários.
 *
 * Todas usam bearerSecurity porque dependem
 * de access token JWT válido.
 */
export const adminCommentsPaths = {
  '/admin/comments': {
    get: {
      tags: ['Admin Comments'],
      summary: 'Lista comentários para moderação',
      description:
        'Lista comentários para a tela de moderação administrativa, com filtro opcional por status, ordenação determinística (mais recente primeiro) e paginação.',
      security: bearerSecurity,
      parameters: [
        {
          in: 'query',
          name: 'status',
          required: false,
          description:
            'Filtra comentários pelo status. Quando omitido, lista comentários independentemente do status.',
          schema: {
            type: 'string',
            enum: ['PENDING', 'APPROVED', 'HIDDEN'],
          },
        },
        {
          in: 'query',
          name: 'page',
          required: false,
          description: 'Número da página (padrão: 1).',
          schema: { type: 'integer', minimum: 1, default: 1 },
        },
        {
          in: 'query',
          name: 'limit',
          required: false,
          description: 'Itens por página (padrão: 20, máximo: 100).',
          schema: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
        },
      ],
      responses: {
        '200': successResponse(
          'Lista paginada de comentários para moderação.',
          '#/components/schemas/AdminCommentListResponse',
        ),
        '400': errorResponse('Parâmetro de status ou paginação inválido.'),
        '401': errorResponse('Token ausente, inválido ou sessão expirada.'),
        '429': globalRateLimitResponse,
      },
    },
  },

  '/admin/comments/{commentId}/approve': {
    patch: {
      tags: ['Admin Comments'],
      summary: 'Aprova um comentário pendente',
      description:
        'Altera o status do comentário para APPROVED, permitindo sua exibição pública.',
      security: bearerSecurity,
      parameters: [
        {
          in: 'path',
          name: 'commentId',
          required: true,
          description: 'Identificador do comentário.',
          schema: {
            type: 'string',
            format: 'uuid',
          },
        },
      ],
      responses: {
        '200': successResponse(
          'Comentário aprovado com sucesso.',
          '#/components/schemas/CommentResponse',
        ),
        '401': errorResponse('Token ausente, inválido ou sessão expirada.'),
        '404': errorResponse('Comentário não encontrado.'),
        '429': globalRateLimitResponse,
      },
    },
  },

  '/admin/comments/{commentId}': {
    patch: {
      tags: ['Admin Comments'],
      summary: 'Edita um comentário',
      description:
        'Permite ao administrador editar parcialmente o autor, conteúdo ou status do comentário.',
      security: bearerSecurity,
      parameters: [
        {
          in: 'path',
          name: 'commentId',
          required: true,
          description: 'Identificador do comentário.',
          schema: {
            type: 'string',
            format: 'uuid',
          },
        },
      ],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              $ref: '#/components/schemas/UpdateCommentRequest',
            },
          },
        },
      },
      responses: {
        '200': successResponse(
          'Comentário atualizado com sucesso.',
          '#/components/schemas/CommentResponse',
        ),
        '400': errorResponse('Payload inválido.'),
        '401': errorResponse('Token ausente, inválido ou sessão expirada.'),
        '404': errorResponse('Comentário não encontrado.'),
        '429': globalRateLimitResponse,
      },
    },

    delete: {
      tags: ['Admin Comments'],
      summary: 'Remove um comentário',
      description:
        'Apaga definitivamente um comentário. Essa operação exige autenticação administrativa.',
      security: bearerSecurity,
      parameters: [
        {
          in: 'path',
          name: 'commentId',
          required: true,
          description: 'Identificador do comentário.',
          schema: {
            type: 'string',
            format: 'uuid',
          },
        },
      ],
      responses: {
        '200': successResponse(
          'Comentário removido com sucesso.',
          '#/components/schemas/DeleteCommentResponse',
        ),
        '401': errorResponse('Token ausente, inválido ou sessão expirada.'),
        '404': errorResponse('Comentário não encontrado.'),
        '429': globalRateLimitResponse,
      },
    },
  },
} as const;
