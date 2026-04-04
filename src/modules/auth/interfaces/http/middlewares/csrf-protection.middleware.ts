import type { RequestHandler } from 'express';
import { getCsrfCookieName } from '../../../auth.config';
import { parseCookies } from '../auth.cookies';
import { HttpError } from '../../../../../shared/errors/http-error';

// Middleware de proteção CSRF no padrão double-submit cookie.
export const csrfProtectionMiddleware: RequestHandler = (
  request,
  _response,
  next,
) => {
  try {
    const cookies = parseCookies(request.headers.cookie);
    const csrfCookie = cookies[getCsrfCookieName()];
    const csrfHeader = request.header('x-csrf-token');

    if (
      !csrfCookie ||
      typeof csrfHeader !== 'string' ||
      csrfHeader !== csrfCookie
    ) {
      throw new HttpError(403, 'Falha na validação CSRF.');
    }

    next();
  } catch (error) {
    next(error);
  }
};
