import { authPaths, authSchemas, authTags } from './auth.swagger';
import {
  commentsTags,
  commentsSchemas,
  commentsPaths,
} from './comments.swagger';
import { healthPaths, healthTags } from './health.swagger';
import { worksPaths, worksSchemas, worksTags } from './works.swagger';

export const openApiDocument = {
  openapi: '3.0.3',

  info: {
    title: 'Carshop Backend API',
    version: '1.0.0',
    description:
      'API do portfólio Carshop com autenticação JWT, works, comentários e upload de imagens.',
  },

  tags: [...healthTags, ...authTags, ...worksTags, ...commentsTags],

  components: {
    securitySchemes: {
      bearerAuth: {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
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
          message: { type: 'string' },
        },
      },

      ...authSchemas,
      ...worksSchemas,
      ...commentsSchemas,
    },
  },

  paths: {
    ...healthPaths,
    ...authPaths,
    ...worksPaths,
    ...commentsPaths,
  },
} as const;
