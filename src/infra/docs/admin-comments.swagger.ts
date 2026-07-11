import {
  bearerSecurity,
  errorResponse,
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
} as const;

/**
 * Rotas administrativas de comentários.
 *
 * Todas usam bearerSecurity porque dependem
 * de access token JWT válido.
 */
export const adminCommentsPaths = {
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
      },
    },
  },
} as const;
