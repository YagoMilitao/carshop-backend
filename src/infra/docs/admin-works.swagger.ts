import {
  bearerSecurity,
  errorResponse,
  successResponse,
} from './swagger.helpers';

/**
 * Tag das operações administrativas sobre works.
 */
export const adminWorksTags = [
  {
    name: 'Admin Works',
    description: 'Gerenciamento administrativo dos trabalhos do portfólio.',
  },
] as const;

/**
 * Schemas usados nas operações administrativas.
 */
export const adminWorksSchemas = {
  CreateWorkRequest: {
    type: 'object',
    required: ['slug', 'title', 'description', 'category', 'tags', 'status'],
    properties: {
      slug: {
        type: 'string',
        example: 'reforma-banco-couro-civic',
      },
      title: {
        type: 'string',
        maxLength: 120,
        example: 'Reforma de banco em couro do Civic',
      },
      description: {
        type: 'string',
        maxLength: 5000,
        example:
          'Troca completa do revestimento dos bancos com acabamento premium.',
      },
      category: {
        type: 'string',
        example: 'bancos',
      },
      tags: {
        type: 'array',
        items: {
          type: 'string',
        },
        example: ['couro', 'honda', 'civic'],
      },
      status: {
        type: 'string',
        enum: ['draft', 'published'],
        example: 'published',
      },
      metadata: {
        type: 'object',
        properties: {
          vehicleBrand: {
            type: 'string',
            example: 'Honda',
          },
          vehicleModel: {
            type: 'string',
            example: 'Civic',
          },
          serviceType: {
            type: 'string',
            example: 'Reforma de bancos',
          },
        },
      },
      seo: {
        type: 'object',
        properties: {
          metaTitle: {
            type: 'string',
            maxLength: 120,
            example: 'Reforma de banco em couro do Honda Civic',
          },
          metaDescription: {
            type: 'string',
            maxLength: 255,
            example:
              'Conheça o trabalho de reforma dos bancos em couro deste Honda Civic.',
          },
          keywords: {
            type: 'array',
            items: {
              type: 'string',
            },
            example: ['couro', 'civic', 'tapeçaria automotiva'],
          },
        },
      },
    },
  },

  UploadWorkImageResponse: {
    type: 'object',
    required: ['message'],
    properties: {
      message: {
        type: 'string',
        example: 'Imagem adicionada com sucesso.',
      },
    },
  },
} as const;

export const adminWorksPaths = {
  '/works': {
    /**
     * O GET público já existe em works.swagger.ts.
     *
     * Este objeto adiciona apenas o POST protegido.
     * A mesclagem correta será feita depois no documento principal.
     */
    post: {
      tags: ['Admin Works'],
      summary: 'Cria um novo trabalho',
      description:
        'Cria um trabalho no portfólio. Exige autenticação administrativa via JWT.',
      security: bearerSecurity,
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              $ref: '#/components/schemas/CreateWorkRequest',
            },
          },
        },
      },
      responses: {
        '201': successResponse(
          'Trabalho criado com sucesso.',
          '#/components/schemas/WorkResponse',
        ),
        '400': errorResponse('Payload inválido.'),
        '401': errorResponse('Token ausente, inválido ou sessão expirada.'),
        '409': errorResponse('Já existe um trabalho com esse slug.'),
      },
    },
  },

  '/admin/works/{workId}/images': {
    post: {
      tags: ['Admin Works'],
      summary: 'Adiciona uma imagem ao trabalho',
      description:
        'Envia uma imagem para o storage externo e salva somente URL e metadados no MongoDB.',
      security: bearerSecurity,
      parameters: [
        {
          in: 'path',
          name: 'workId',
          required: true,
          description: 'Identificador do trabalho.',
          schema: {
            type: 'string',
            format: 'uuid',
          },
        },
      ],
      requestBody: {
        required: true,
        content: {
          'multipart/form-data': {
            schema: {
              type: 'object',
              required: ['file', 'alt'],
              properties: {
                file: {
                  type: 'string',
                  format: 'binary',
                  description: 'Imagem JPEG, PNG ou WebP.',
                },
                alt: {
                  type: 'string',
                  maxLength: 160,
                  example: 'Banco do Honda Civic reformado em couro.',
                },
                isCover: {
                  type: 'boolean',
                  default: false,
                  example: true,
                },
              },
            },
          },
        },
      },
      responses: {
        '201': successResponse(
          'Imagem adicionada com sucesso.',
          '#/components/schemas/UploadWorkImageResponse',
        ),
        '400': errorResponse('Arquivo ou dados do upload inválidos.'),
        '401': errorResponse('Token ausente, inválido ou sessão expirada.'),
        '404': errorResponse('Trabalho não encontrado.'),
      },
    },
  },
} as const;
