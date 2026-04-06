import type { Response } from 'express';
import {
  getCsrfCookieName,
  getRefreshCookieName,
} from '../../infra/constants/auth.constants';

function isProduction() {
  return process.env.NODE_ENV === 'production';
}

// Calcula o tempo de vida do cookie de refresh com possibilidade de override por env.
function getRefreshTokenMaxAgeMs() {
  const value = process.env.JWT_REFRESH_COOKIE_MAX_AGE_MS;

  if (!value) return 7 * 24 * 60 * 60 * 1000;

  const asNumber = Number(value);
  return Number.isNaN(asNumber) ? 7 * 24 * 60 * 60 * 1000 : asNumber;
}

// Grava os cookies de autenticação com flags de segurança.
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

// Remove os cookies quando a sessão é encerrada.
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

// Parse manual do header Cookie para evitar dependência extra.
export function parseCookies(cookieHeader: string | undefined) {
  if (!cookieHeader) return {};

  return cookieHeader.split(';').reduce<Record<string, string>>((acc, part) => {
    const [name, ...rest] = part.trim().split('=');

    if (!name || rest.length === 0) return acc;

    acc[name] = decodeURIComponent(rest.join('='));
    return acc;
  }, {});
}
