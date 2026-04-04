export const openApiDocument = {
  openapi: '3.0.3',
  info: {
    title: 'Carshop Backend API',
    version: '1.0.0',
    description:
      'API de autenticação com JWT (access + refresh), rotação de sessão e proteção CSRF.',
  },
  tags: [{ name: 'Health' }, { name: 'Auth' }],
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
      LoginRequest: {
        type: 'object',
        required: ['email', 'password'],
        properties: {
          email: { type: 'string', format: 'email', example: 'admin@carshop.com' },
          password: { type: 'string', example: '123456' },
        },
      },
      AuthResponse: {
        type: 'object',
        required: ['accessToken', 'sessionId', 'tokenType'],
        properties: {
          accessToken: { type: 'string' },
          sessionId: { type: 'string', format: 'uuid' },
          tokenType: { type: 'string', enum: ['Bearer'] },
        },
      },
      LogoutResponse: {
        type: 'object',
        required: ['success'],
        properties: {
          success: { type: 'boolean', example: true },
        },
      },
      SessionResponse: {
        type: 'object',
        required: ['sessionId', 'email', 'expiresAt'],
        properties: {
          sessionId: { type: 'string', format: 'uuid' },
          email: { type: 'string', format: 'email' },
          expiresAt: { type: 'string', format: 'date-time' },
        },
      },
      ErrorResponse: {
        type: 'object',
        required: ['message'],
        properties: {
          message: { type: 'string' },
        },
      },
    },
  },
  paths: {
    '/': {
      get: {
        tags: ['Health'],
        summary: 'Health check da API',
        responses: {
          '200': {
            description: 'Servidor operacional',
            content: {
              'text/plain': {
                schema: { type: 'string', example: 'Hello World!' },
              },
            },
          },
        },
      },
    },
    '/auth/login': {
      post: {
        tags: ['Auth'],
        summary: 'Autentica o administrador e cria sessão',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/LoginRequest' },
            },
          },
        },
        responses: {
          '200': {
            description: 'Login efetuado com sucesso',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/AuthResponse' },
              },
            },
          },
          '400': {
            description: 'Body inválido',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ErrorResponse' },
              },
            },
          },
          '401': {
            description: 'Credenciais inválidas',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ErrorResponse' },
              },
            },
          },
        },
      },
    },
    '/auth/refresh': {
      post: {
        tags: ['Auth'],
        summary: 'Rotaciona access token, refresh token e csrf token',
        security: [{ refreshTokenCookie: [] }, { csrfTokenCookie: [] }],
        parameters: [
          {
            in: 'header',
            name: 'x-csrf-token',
            required: true,
            schema: { type: 'string' },
          },
        ],
        responses: {
          '200': {
            description: 'Sessão renovada',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/AuthResponse' },
              },
            },
          },
          '401': {
            description: 'Refresh token inválido',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ErrorResponse' },
              },
            },
          },
          '403': {
            description: 'Falha na validação CSRF',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ErrorResponse' },
              },
            },
          },
        },
      },
    },
    '/auth/logout': {
      post: {
        tags: ['Auth'],
        summary: 'Revoga a sessão autenticada e remove cookies',
        security: [{ refreshTokenCookie: [] }, { csrfTokenCookie: [] }],
        parameters: [
          {
            in: 'header',
            name: 'x-csrf-token',
            required: true,
            schema: { type: 'string' },
          },
        ],
        responses: {
          '200': {
            description: 'Logout efetuado com sucesso',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/LogoutResponse' },
              },
            },
          },
          '401': {
            description: 'Sessão inválida',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ErrorResponse' },
              },
            },
          },
          '403': {
            description: 'Falha na validação CSRF',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ErrorResponse' },
              },
            },
          },
        },
      },
    },
    '/auth/session': {
      get: {
        tags: ['Auth'],
        summary: 'Retorna dados da sessão atual',
        security: [{ bearerAuth: [] }],
        responses: {
          '200': {
            description: 'Sessão válida',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/SessionResponse' },
              },
            },
          },
          '401': {
            description: 'Token inválido ou sessão expirada',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ErrorResponse' },
              },
            },
          },
        },
      },
    },
  },
} as const;
