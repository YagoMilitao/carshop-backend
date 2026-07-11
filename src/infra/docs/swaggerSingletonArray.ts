import {
  adminCommentsPaths,
  adminCommentsSchemas,
  adminCommentsTags,
} from './admin-comments.swagger';
import {
  adminWorksPaths,
  adminWorksSchemas,
  adminWorksTags,
} from './admin-works.swagger';
import { authPaths, authSchemas, authTags } from './auth.swagger';
import {
  commentsPaths,
  commentsSchemas,
  commentsTags,
} from './comments.swagger';
import { healthPaths, healthTags } from './health.swagger';
import { mergeOpenApiPaths } from './swagger.merge';
import { worksPaths, worksSchemas, worksTags } from './works.swagger';

/**
 * Documento OpenAPI central.
 *
 * Os módulos exportam tags, schemas e paths.
 * Este arquivo apenas reúne todas as partes.
 */
export const openApiDocument = {
  openapi: '3.0.3',

  info: {
    title: 'Carshop Backend API',
    version: '1.0.0',
    description:
      'API do portfólio Carshop com autenticação JWT, gerenciamento de trabalhos, comentários e imagens.',
  },

  tags: [
    ...healthTags,
    ...authTags,
    ...worksTags,
    ...commentsTags,
    ...adminWorksTags,
    ...adminCommentsTags,
  ],

  components: {
    /**
     * Equivalente ao addBearerAuth() do NestJS.
     */
    securitySchemes: {
      bearerAuth: {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        description:
          'Informe apenas o access token JWT. O Swagger adicionará o prefixo Bearer.',
      },

      refreshTokenCookie: {
        type: 'apiKey',
        in: 'cookie',
        name: 'refresh_token',
      },

      csrfTokenCookie: {
        type: 'apiKey',
        in: 'cookie',
        name: 'csrf_token',
      },
    },

    schemas: {
      ErrorResponse: {
        type: 'object',
        required: ['message'],
        properties: {
          message: {
            type: 'string',
            example: 'Requisição inválida.',
          },
        },
      },

      ...authSchemas,
      ...worksSchemas,
      ...commentsSchemas,
      ...adminWorksSchemas,
      ...adminCommentsSchemas,
    },
  },

  /**
   * A função de merge preserva operações diferentes
   * registradas no mesmo endereço, como GET e POST /works.
   */
  paths: mergeOpenApiPaths(
    healthPaths,
    authPaths,
    worksPaths,
    commentsPaths,
    adminWorksPaths,
    adminCommentsPaths,
  ),
} as const;
