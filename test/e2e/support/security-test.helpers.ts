import request from 'supertest';
import type { createApp } from '../../../src/infra/server';

/**
 * Shared test-support helpers for the CARSHOP-111 security-controls E2E
 * suite (`test/e2e/security-*.e2e-spec.ts`).
 *
 * Motivo:
 * evitar duplicar os mesmos helpers de cookie/login já usados em
 * `auth-login-rate-limit.e2e-spec.ts`/`app.e2e-spec.ts`, sem refatorar
 * esses arquivos existentes (fora do escopo desta tarefa).
 */

export interface AuthResponseBody {
  accessToken: string;
  sessionId: string;
  tokenType: 'Bearer';
}

/**
 * Extrai o valor bruto (`name=value`) de um cookie específico a partir do
 * array de headers `Set-Cookie`.
 */
export function extractCookie(
  setCookie: string[],
  cookieName: string,
): string | undefined {
  const cookie = setCookie.find((entry) => entry.startsWith(`${cookieName}=`));
  return cookie?.split(';')[0];
}

/**
 * Normaliza o header `Set-Cookie` (string única ou array) em um array.
 */
export function getSetCookieArray(
  headers: Record<string, unknown>,
): string[] {
  const rawSetCookie = headers['set-cookie'];
  if (Array.isArray(rawSetCookie)) {
    return rawSetCookie as string[];
  }
  if (typeof rawSetCookie === 'string') {
    return [rawSetCookie];
  }
  return [];
}

export interface AdminLoginResult {
  accessToken: string;
  sessionId: string;
  refreshCookie: string;
  csrfCookie: string;
  csrfToken: string;
}

/**
 * Autentica o admin configurado no ambiente de teste e devolve o
 * access token, o sessionId e os cookies/token CSRF emitidos pelo login.
 *
 * Motivo:
 * centralizar o fluxo de login usado por múltiplos cenários das
 * specs de segurança, preservando o contrato real de `POST /auth/login`.
 */
export async function loginAsAdmin(
  app: ReturnType<typeof createApp>,
  email: string,
  password: string,
): Promise<AdminLoginResult> {
  const loginResponse = await request(app)
    .post('/auth/login')
    .send({ email, password })
    .expect(200);

  const loginBody = loginResponse.body as AuthResponseBody;
  const setCookie = getSetCookieArray(
    loginResponse.headers as Record<string, unknown>,
  );
  const refreshCookie = extractCookie(setCookie, 'refresh_token');
  const csrfCookie = extractCookie(setCookie, 'csrf_token');
  const csrfToken = csrfCookie?.split('=')[1];

  if (!refreshCookie || !csrfCookie || !csrfToken) {
    throw new Error(
      'loginAsAdmin: login response did not include the expected refresh_token/csrf_token cookies.',
    );
  }

  return {
    accessToken: loginBody.accessToken,
    sessionId: loginBody.sessionId,
    refreshCookie,
    csrfCookie,
    csrfToken,
  };
}
