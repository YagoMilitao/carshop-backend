const jsonResponse = (ref: string) =>
  ({
    content: {
      'application/json': {
        schema: { $ref: ref },
      },
    },
  }) as const;

const jsonErrorResponse = jsonResponse('#/components/schemas/ErrorResponse');

const loginRequestBody = {
  required: true,
  content: {
    'application/json': {
      schema: { $ref: '#/components/schemas/LoginRequest' },
    },
  },
} as const;

const authTag = ['Auth'] as const;
const healthTag = ['Health'] as const;

const csrfHeaderParameter = {
  in: 'header',
  name: 'x-csrf-token',
  required: true,
  schema: { type: 'string' },
} as const;

const refreshCsrfSecurity = [
  { refreshTokenCookie: [] },
  { csrfTokenCookie: [] },
] as const;

const bearerSecurity = [{ bearerAuth: [] }] as const;

const successResponse = (description: string, ref: string) =>
  ({
    description,
    ...jsonResponse(ref),
  }) as const;

const errorResponse = (description: string) =>
  ({
    description,
    ...jsonErrorResponse,
  }) as const;

const csrfValidationErrorResponse = errorResponse('Falha na validação CSRF.');

const buildCsrfProtectedAuthPostOperation = ({
  summary,
  successDescription,
  successRef,
  unauthorizedDescription,
}: {
  summary: string;
  successDescription: string;
  successRef: string;
  unauthorizedDescription: string;
}) =>
  ({
    tags: authTag,
    summary,
    security: refreshCsrfSecurity,
    parameters: [csrfHeaderParameter],
    responses: {
      '200': successResponse(successDescription, successRef),
      '401': errorResponse(unauthorizedDescription),
      '403': csrfValidationErrorResponse,
    },
  }) as const;

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
          email: {
            type: 'string',
            format: 'email',
            example: 'admin@carshop.com',
          },
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
        tags: healthTag,
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
        tags: authTag,
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
      post: buildCsrfProtectedAuthPostOperation({
        summary: 'Rotaciona access token, refresh token e csrf token',
        successDescription: 'Sessão renovada',
        successRef: '#/components/schemas/AuthResponse',
        unauthorizedDescription: 'Refresh token inválido',
      }),
    },
    '/auth/logout': {
      post: buildCsrfProtectedAuthPostOperation({
        summary: 'Revoga a sessão autenticada e remove cookies',
        successDescription: 'Logout efetuado com sucesso',
        successRef: '#/components/schemas/LogoutResponse',
        unauthorizedDescription: 'Sessão inválida',
      }),
    },
    '/auth/session': {
      get: {
        tags: authTag,
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
  },
} as const;
