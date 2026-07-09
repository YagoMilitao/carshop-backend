import {
  bearerSecurity,
  csrfHeaderParameter,
  errorResponse,
  refreshCsrfSecurity,
  successResponse,
} from './swagger.helpers';

export const authTags = [{ name: 'Auth' }] as const;

export const authSchemas = {
  LoginRequest: {
    type: 'object',
    required: ['email', 'password'],
    properties: {
      email: {
        type: 'string',
        format: 'email',
        example: 'admin@carshop.com',
      },
      password: {
        type: 'string',
        example: '123456',
      },
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
} as const;

const loginRequestBody = {
  required: true,
  content: {
    'application/json': {
      schema: { $ref: '#/components/schemas/LoginRequest' },
    },
  },
} as const;

export const authPaths = {
  '/auth/login': {
    post: {
      tags: ['Auth'],
      summary: 'Autentica o administrador e cria sessão',
      requestBody: loginRequestBody,
      responses: {
        '200': successResponse(
          'Login efetuado com sucesso',
          '#/components/schemas/AuthResponse',
        ),
        '400': errorResponse('Body inválido'),
        '401': errorResponse('Credenciais inválidas'),
      },
    },
  },

  '/auth/refresh': {
    post: {
      tags: ['Auth'],
      summary: 'Rotaciona access token, refresh token e csrf token',
      security: refreshCsrfSecurity,
      parameters: [csrfHeaderParameter],
      responses: {
        '200': successResponse(
          'Sessão renovada',
          '#/components/schemas/AuthResponse',
        ),
        '401': errorResponse('Refresh token inválido'),
        '403': errorResponse('Falha na validação CSRF'),
      },
    },
  },

  '/auth/logout': {
    post: {
      tags: ['Auth'],
      summary: 'Revoga a sessão autenticada e remove cookies',
      security: refreshCsrfSecurity,
      parameters: [csrfHeaderParameter],
      responses: {
        '200': successResponse(
          'Logout efetuado com sucesso',
          '#/components/schemas/LogoutResponse',
        ),
        '401': errorResponse('Sessão inválida'),
        '403': errorResponse('Falha na validação CSRF'),
      },
    },
  },

  '/auth/session': {
    get: {
      tags: ['Auth'],
      summary: 'Retorna dados da sessão atual',
      security: bearerSecurity,
      responses: {
        '200': successResponse(
          'Sessão válida',
          '#/components/schemas/SessionResponse',
        ),
        '401': errorResponse('Token inválido ou sessão expirada'),
      },
    },
  },
} as const;
