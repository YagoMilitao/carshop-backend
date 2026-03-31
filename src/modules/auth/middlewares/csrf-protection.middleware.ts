import { ForbiddenException, Injectable, NestMiddleware } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import { getCsrfCookieName } from '../auth.config';
import { parseCookies } from '../auth.cookies';

@Injectable()
export class CsrfProtectionMiddleware implements NestMiddleware {
  // Exige que o header X-CSRF-Token corresponda ao cookie csrf_token.
  use(req: Request, _res: Response, next: NextFunction) {
    const cookies = parseCookies(req.headers.cookie);
    const csrfCookie = cookies[getCsrfCookieName()];
    const csrfHeader = req.headers['x-csrf-token'];

    if (
      !csrfCookie ||
      typeof csrfHeader !== 'string' ||
      csrfHeader !== csrfCookie
    ) {
      throw new ForbiddenException('Falha na validação CSRF.');
    }

    next();
  }
}
