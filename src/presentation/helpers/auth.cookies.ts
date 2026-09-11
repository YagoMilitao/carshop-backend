import type { Response } from 'express';
import {
  getCsrfCookieName,
  getRefreshCookieName,
} from '../../infra/constants/auth.constants';

/**
 * Calcula o tempo de vida do cookie de refresh.
 *
 * Permite override por variável de ambiente,
 * mantendo fallback seguro para desenvolvimento.
 */
function getRefreshTokenMaxAgeMs(): number {
  const DEFAULT_REFRESH_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
  const value = process.env.JWT_REFRESH_COOKIE_MAX_AGE_MS;

  if (!value) {
    return DEFAULT_REFRESH_MAX_AGE_MS;
  }

  const asNumber = Number(value);

  if (Number.isNaN(asNumber) || asNumber <= 0) {
    return DEFAULT_REFRESH_MAX_AGE_MS;
  }

  return asNumber;
}

/**
 * Grava os cookies de autenticação.
 *
 * refresh_token:
 * - httpOnly para não ser lido por JavaScript
 *
 * csrf_token:
 * - participa da validação double-submit enviada automaticamente pelo browser
 * - o frontend cross-origin recebe o mesmo valor no corpo da resposta de auth
 */
export function setAuthCookies(
  response: Response,
  refreshToken: string,
  csrfToken: string,
): void {
  // SameSite=None é exigido para suportar o frontend cross-origin
  // (Next.js em outra origem que não a do backend). Navegadores rejeitam
  // SameSite=None sem o atributo Secure, portanto secure precisa ser
  // incondicional aqui, independentemente de NODE_ENV.
  const secure = true;
  const sameSite = 'none' as const;
  const maxAge = getRefreshTokenMaxAgeMs();

  response.cookie(getRefreshCookieName(), refreshToken, {
    httpOnly: true,
    sameSite,
    secure,
    path: '/auth',
    maxAge,
  });

  response.cookie(getCsrfCookieName(), csrfToken, {
    httpOnly: false,
    sameSite,
    secure,
    path: '/auth',
    maxAge,
  });
}

/**
 * Remove os cookies de autenticação no logout.
 */
export function clearAuthCookies(response: Response): void {
  // Mesmo motivo de setAuthCookies: SameSite=None exige Secure sempre,
  // independentemente de NODE_ENV, para o navegador aceitar o cookie.
  const secure = true;
  const sameSite = 'none' as const;

  response.clearCookie(getRefreshCookieName(), {
    httpOnly: true,
    sameSite,
    secure,
    path: '/auth',
  });

  response.clearCookie(getCsrfCookieName(), {
    httpOnly: false,
    sameSite,
    secure,
    path: '/auth',
  });
}

/**
 * Representa cookies parseados do header Cookie.
 */
export type ParsedCookies = Record<string, string>;

/**
 * Faz parse manual do header Cookie.
 *
 * Motivo:
 * evitar dependência extra e manter controle total do parsing.
 */
export function parseCookies(cookieHeader: string | undefined): ParsedCookies {
  if (!cookieHeader) {
    return {};
  }

  return cookieHeader.split(';').reduce<ParsedCookies>((accumulator, part) => {
    const [name, ...rest] = part.trim().split('=');

    if (!name || rest.length === 0) {
      return accumulator;
    }

    accumulator[name] = decodeURIComponent(rest.join('='));

    return accumulator;
  }, {});
}
