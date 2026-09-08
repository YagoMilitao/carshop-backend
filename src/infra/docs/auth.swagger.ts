import {
  bearerSecurity,
  csrfHeaderParameter,
  errorResponse,
  globalRateLimitResponse,
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
    required: ['accessToken', 'csrfToken', 'sessionId', 'tokenType'],
    properties: {
      accessToken: { type: 'string' },
      csrfToken: {
        type: 'string',
        description:
          'Token CSRF que deve ser enviado no header X-CSRF-Token da próxima requisição de refresh ou logout.',
      },
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
      description:
        'Em caso de sucesso, define os cookies refresh_token (HttpOnly, ' +
        'Secure, SameSite=None, Path=/auth) e csrf_token (Secure, ' +
        'SameSite=None, Path=/auth, não HttpOnly). ' +
        'SameSite=None e Secure são aplicados sempre, independentemente ' +
        'do ambiente, para suportar um frontend hospedado em origem ' +
        'diferente da do backend. O corpo da resposta também inclui o ' +
        'csrfToken, pois JavaScript em outra origem não pode ler o cookie ' +
        'definido para o domínio da API.',
      requestBody: loginRequestBody,
      responses: {
        '200': successResponse(
          'Login efetuado com sucesso',
          '#/components/schemas/AuthResponse',
        ),
        '400': errorResponse('Body inválido'),
        '401': errorResponse('Credenciais inválidas'),
        '429': errorResponse(
          'Limite global (100 requisições por IP em 15 minutos) ou limite dedicado de login (5 tentativas por IP + e-mail em 5 minutos) excedido.',
        ),
      },
    },
  },

  '/auth/refresh': {
    post: {
      tags: ['Auth'],
      summary: 'Rotaciona access token, refresh token e csrf token',
      description:
        'Em caso de sucesso, rotaciona e redefine os cookies ' +
        'refresh_token (HttpOnly, Secure, SameSite=None, Path=/auth) e ' +
        'csrf_token (Secure, SameSite=None, Path=/auth) a cada chamada, ' +
        'invalidando os valores anteriores. Exige o cookie refresh_token ' +
        'e o header X-CSRF-Token correspondente ao csrf_token. O novo ' +
        'csrfToken é retornado no corpo para uso na próxima requisição.',
      security: refreshCsrfSecurity,
      parameters: [csrfHeaderParameter],
      responses: {
        '200': successResponse(
          'Sessão renovada',
          '#/components/schemas/AuthResponse',
        ),
        '401': errorResponse('Refresh token inválido'),
        '403': errorResponse('Falha na validação CSRF'),
        '429': globalRateLimitResponse,
      },
    },
  },

  '/auth/logout': {
    post: {
      tags: ['Auth'],
      summary: 'Revoga a sessão autenticada e remove cookies',
      description:
        'Revoga a sessão no servidor e remove os cookies refresh_token e ' +
        'csrf_token (ambos com Path=/auth, Secure e SameSite=None), ' +
        'exigindo o header X-CSRF-Token correspondente ao csrf_token.',
      security: refreshCsrfSecurity,
      parameters: [csrfHeaderParameter],
      responses: {
        '200': successResponse(
          'Logout efetuado com sucesso',
          '#/components/schemas/LogoutResponse',
        ),
        '401': errorResponse('Sessão inválida'),
        '403': errorResponse('Falha na validação CSRF'),
        '429': globalRateLimitResponse,
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
        '429': globalRateLimitResponse,
      },
    },
  },
} as const;
