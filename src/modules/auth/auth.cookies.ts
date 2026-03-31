import { randomBytes } from 'crypto';
import type { Response } from 'express';
import { getCsrfCookieName, getRefreshCookieName } from './auth.config';

function isProduction() {
  return process.env.NODE_ENV === 'production';
}

// Calcula o tempo de vida do cookie de refresh e permite override por variável de ambiente.
function getRefreshTokenMaxAgeMs() {
  const value = process.env.JWT_REFRESH_COOKIE_MAX_AGE_MS;

  if (!value) return 7 * 24 * 60 * 60 * 1000;

  const asNumber = Number(value);
  return Number.isNaN(asNumber) ? 7 * 24 * 60 * 60 * 1000 : asNumber;
}

// Grava os cookies de autenticação com flags adequadas para sessão e proteção CSRF.
export function setAuthCookies(
  response: Response,
  refreshToken: string,
  csrfToken: string,
) {
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

// Remove os cookies de autenticação ao encerrar a sessão.
export function clearAuthCookies(response: Response) {
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

// Gera um token aleatório usado pelo padrão double-submit contra CSRF.
export function createCsrfToken() {
  return randomBytes(24).toString('hex');
}

// Faz o parse manual do header Cookie para evitar dependência extra no projeto.
export function parseCookies(cookieHeader: string | undefined) {
  if (!cookieHeader) return {};

  return cookieHeader.split(';').reduce<Record<string, string>>((acc, part) => {
    const [name, ...rest] = part.trim().split('=');

    if (!name || rest.length === 0) return acc;

    acc[name] = decodeURIComponent(rest.join('='));
    return acc;
  }, {});
}
