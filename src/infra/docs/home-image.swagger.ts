import {
  bearerSecurity,
  errorResponse,
  globalRateLimitResponse,
  successResponse,
} from './swagger.helpers';

const IDENTIFIER_PATTERN = '^[A-Za-z0-9-]+$';

const ELIGIBILITY_RULE_DESCRIPTION = [
  'Regra de elegibilidade: somente imagens de trabalhos com `status` `published` e não removidos logicamente podem ser a imagem da Home.',
  '',
  'A referência salva (`workId` + `imageId`) é revalidada a cada leitura pública contra o estado atual do trabalho. Se a imagem for removida (`DELETE /admin/works/{workId}/images/{imageId}`), se o trabalho for removido definitivamente (`DELETE /admin/works/{workId}`, inclusive pela rotina de expurgo) ou logicamente, ou se o trabalho voltar para `draft`, `GET /home-image` passa a responder `{ "image": null }`. Se o trabalho voltar a `published` com a mesma imagem, ela volta a ser exibida.',
].join('\n');

/**
 * Tag das operações da imagem principal da Home (CARSHOP-159).
 */
export const homeImageTags = [
  {
    name: 'Home Image',
    description:
      'Configuração da imagem principal (hero) da Home pública do site.',
  },
] as const;

/**
 * Schemas da imagem principal da Home.
 */
export const homeImageSchemas = {
  HomeImage: {
    type: 'object',
    required: ['workId', 'imageId', 'url', 'alt'],
    description:
      'Imagem gerenciada pelo sistema selecionada para a Home. Dimensões (largura/altura) não são armazenadas pelo sistema e, por isso, não fazem parte da resposta.',
    properties: {
      workId: {
        type: 'string',
        description: 'Identificador do trabalho dono da imagem.',
        example: 'cf357670-d168-48b4-a5de-c57dff7858fe',
      },
      imageId: {
        type: 'string',
        description: 'Identificador da imagem dentro do trabalho.',
        example: '0b7e4a1c-3f2d-4c5e-9a8b-1d2e3f4a5b6c',
      },
      url: {
        type: 'string',
        description:
          'URL pública da imagem, derivada do armazenamento do sistema (nunca fornecida pelo cliente).',
        example: 'https://images.example.com/carshop/works/banco-civic.jpg',
      },
      alt: {
        type: 'string',
        description: 'Texto alternativo da imagem (pode ser vazio).',
        example: 'Banco do Honda Civic reformado em couro preto.',
      },
    },
  },

  HomeImageResponse: {
    type: 'object',
    required: ['image'],
    properties: {
      image: {
        type: 'object',
        allOf: [{ $ref: '#/components/schemas/HomeImage' }],
        nullable: true,
        description:
          '`null` quando nenhuma imagem está configurada ou quando a imagem configurada deixou de existir ou de ser elegível.',
      },
    },
  },

  SetHomeImageRequest: {
    type: 'object',
    required: ['workId', 'imageId'],
    additionalProperties: false,
    description:
      'Referência a uma imagem já gerenciada pelo sistema. URLs arbitrárias e campos extras (inclusive `url`) são rejeitados com 400.',
    properties: {
      workId: {
        type: 'string',
        minLength: 1,
        maxLength: 64,
        pattern: IDENTIFIER_PATTERN,
        example: 'cf357670-d168-48b4-a5de-c57dff7858fe',
      },
      imageId: {
        type: 'string',
        minLength: 1,
        maxLength: 64,
        pattern: IDENTIFIER_PATTERN,
        example: '0b7e4a1c-3f2d-4c5e-9a8b-1d2e3f4a5b6c',
      },
    },
  },
} as const;

/**
 * Rotas da imagem principal da Home.
 */
export const homeImagePaths = {
  '/home-image': {
    get: {
      tags: ['Home Image'],

      summary: 'Retorna a imagem principal da Home',

      description: [
        'Endpoint público (sem autenticação). Responde 200 tanto com imagem configurada quanto com `image: null`.',
        '',
        'Quando nenhuma imagem está configurada, ou a imagem configurada não existe mais ou não é elegível, a resposta é `{ "image": null }`, de forma determinística.',
        '',
        'Dimensões da imagem não são armazenadas pelo sistema e são omitidas.',
        '',
        ELIGIBILITY_RULE_DESCRIPTION,
      ].join('\n'),

      security: [],

      responses: {
        '200': successResponse(
          'Configuração atual da imagem da Home (`image` pode ser `null`).',
          '#/components/schemas/HomeImageResponse',
        ),

        '429': globalRateLimitResponse,
      },
    },
  },

  '/admin/home-image': {
    patch: {
      tags: ['Home Image'],

      summary: 'Seleciona ou altera a imagem principal da Home',

      description: [
        'Define qual imagem já gerenciada pelo sistema é a imagem principal da Home, substituindo a seleção anterior (existe no máximo uma configuração).',
        '',
        'A imagem é identificada por `workId` + `imageId`. A URL exibida na Home é sempre derivada da imagem armazenada, nunca de um valor enviado pelo cliente.',
        '',
        'Quando a requisição é rejeitada, a configuração atual permanece inalterada.',
        '',
        ELIGIBILITY_RULE_DESCRIPTION,
      ].join('\n'),

      security: bearerSecurity,

      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/SetHomeImageRequest' },
          },
        },
      },

      responses: {
        '200': successResponse(
          'Imagem da Home selecionada com sucesso. `image` nunca é `null` nesta resposta.',
          '#/components/schemas/HomeImageResponse',
        ),

        '400': errorResponse(
          'Requisição inválida. JSON malformado é rejeitado pelo parser do corpo com `{ "message": "JSON inválido no corpo da requisição." }`. Campo ausente, tipo incorreto, identificador em formato inválido (ex.: URL) ou campos não permitidos retornam `{ "message": "Payload inválido." }`.',
        ),

        '401': errorResponse(
          'Access token ausente, inválido ou sessão expirada/revogada.',
        ),

        '404': errorResponse(
          'Trabalho não encontrado (inexistente ou removido) ou imagem não encontrada no trabalho.',
        ),

        '409': errorResponse(
          'A imagem selecionada não é elegível: o trabalho não está publicado.',
        ),

        '429': globalRateLimitResponse,

        '500': errorResponse('Falha inesperada do servidor.'),
      },
    },
  },
} as const;
