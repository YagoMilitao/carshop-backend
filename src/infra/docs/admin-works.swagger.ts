import {
  bearerSecurity,
  errorResponse,
  successResponse,
} from './swagger.helpers';

/**
 * Tag das operações administrativas relacionadas aos trabalhos.
 */
export const adminWorksTags = [
  {
    name: 'Admin Works',
    description:
      'Gerenciamento administrativo de trabalhos e imagens do portfólio.',
  },
] as const;

/**
 * Schemas usados pelas rotas administrativas de works.
 */
export const adminWorksSchemas = {
  /**
   * Resposta devolvida após o upload da imagem.
   */
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

/**
 * Rotas administrativas relacionadas aos trabalhos.
 */
export const adminWorksPaths = {
  '/admin/works/{workId}/images': {
    post: {
      tags: ['Admin Works'],

      summary: 'Adiciona uma imagem a um trabalho',

      description: [
        'Envia uma imagem para o storage externo e salva no MongoDB apenas a URL e os metadados.',
        '',
        'Regras do upload:',
        '- apenas uma imagem por requisição;',
        '- formatos aceitos: JPEG, PNG e WebP;',
        '- tamanho máximo: 5 MB;',
        '- o campo do arquivo deve se chamar `file`;',
        '- `alt` é usado para acessibilidade e SEO;',
        '- `isCover=true` define a imagem como capa e remove a marcação de capa das demais imagens.',
      ].join('\n'),

      /**
       * Equivalente ao @ApiBearerAuth().
       *
       * Faz o Swagger enviar:
       * Authorization: Bearer <accessToken>
       */
      security: bearerSecurity,

      parameters: [
        {
          in: 'path',
          name: 'workId',
          required: true,
          description: 'Identificador do trabalho que receberá a imagem.',
          schema: {
            type: 'string',
            format: 'uuid',
          },
          example: 'cf357670-d168-48b4-a5de-c57dff7858fe',
        },
      ],

      /**
       * Equivalente ao @ApiConsumes('multipart/form-data')
       * e ao @ApiBody() do NestJS.
       */
      requestBody: {
        required: true,
        description:
          'Arquivo da imagem e seus metadados. Selecione o arquivo no campo `file`.',
        content: {
          'multipart/form-data': {
            schema: {
              type: 'object',
              required: ['file', 'alt'],
              properties: {
                /**
                 * O nome precisa ser igual ao configurado no Multer:
                 * uploadMiddleware.single('file')
                 */
                file: {
                  type: 'string',
                  format: 'binary',
                  description:
                    'Imagem JPEG, PNG ou WebP, com tamanho máximo de 5 MB.',
                },

                alt: {
                  type: 'string',
                  minLength: 2,
                  maxLength: 160,
                  description:
                    'Texto alternativo usado para acessibilidade e SEO.',
                  example: 'Banco do Honda Civic reformado em couro preto.',
                },

                isCover: {
                  /**
                   * Em multipart/form-data, o Express normalmente recebe
                   * esse valor como texto. Seu controller converte
                   * request.body.isCover === "true".
                   */
                  type: 'boolean',
                  default: false,
                  description:
                    'Quando true, define esta imagem como capa do trabalho.',
                  example: true,
                },
              },
            },
          },
        },
      },

      responses: {
        '201': successResponse(
          'Imagem adicionada ao trabalho com sucesso.',
          '#/components/schemas/UploadWorkImageResponse',
        ),

        '400': errorResponse(
          'Arquivo ausente, formato inválido ou metadados incorretos.',
        ),

        '401': errorResponse(
          'Access token ausente, inválido ou sessão expirada.',
        ),

        '404': errorResponse('Trabalho não encontrado.'),

        '413': errorResponse('A imagem ultrapassa o limite de 5 MB.'),

        '415': errorResponse(
          'Tipo de arquivo não suportado. Envie JPEG, PNG ou WebP.',
        ),

        '500': errorResponse(
          'Falha inesperada ao enviar ou persistir a imagem.',
        ),
      },
    },
  },
} as const;
