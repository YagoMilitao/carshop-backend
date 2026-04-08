import type { Response } from 'express';
import {
  getCsrfCookieName,
  getRefreshCookieName,
} from '../../infra/constants/auth.constants';

/**
 * Indica se a aplicação está rodando em produção.
 *
 * Motivo:
 * em produção devemos ativar a flag Secure dos cookies.
 */
function isProduction(): boolean {
  return process.env.NODE_ENV === 'production';
}

/**
 * Calcula o tempo de vida do cookie de refresh.
 *
 * Permite override por variável de ambiente,
 * mantendo fallback seguro para desenvolvimento.
 */
function getRefreshTokenMaxAgeMs(): number {
  const value = process.env.JWT_REFRESH_COOKIE_MAX_AGE_MS;

  if (!value) {
    return 7 * 24 * 60 * 60 * 1000;
  }

  const asNumber = Number(value);

  return Number.isNaN(asNumber) ? 7 * 24 * 60 * 60 * 1000 : asNumber;
}

/**
 * Grava os cookies de autenticação.
 *
 * refresh_token:
 * - httpOnly para não ser lido por JavaScript
 *
 * csrf_token:
 * - precisa ser lido pelo frontend para enviar no header x-csrf-token
 */
export function setAuthCookies(
  response: Response,
  refreshToken: string,
  csrfToken: string,
): void {
  const secure = isProduction();
  const sameSite = 'strict' as const;
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
  const secure = isProduction();
  const sameSite = 'strict' as const;

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
