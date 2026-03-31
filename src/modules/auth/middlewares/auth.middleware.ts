import { Injectable, NestMiddleware, UnauthorizedException } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import { verify } from 'jsonwebtoken';
import { getJwtSecret } from '../auth.config';
import type { JwtPayload } from '../auth.types';
import { SessionStoreService } from '../session-store.service';

@Injectable()
export class AuthMiddleware implements NestMiddleware {
  constructor(private readonly sessionStore: SessionStoreService) {}

  // Valida o access token do header Authorization e confirma se a sessão ainda existe.
  use(req: Request, _res: Response, next: NextFunction) {
    const authorization = req.headers.authorization;
    const token = authorization?.startsWith('Bearer ')
      ? authorization.slice('Bearer '.length)
      : undefined;

    if (!token) {
      throw new UnauthorizedException('Token de acesso ausente.');
    }

    const payload = verify(token, getJwtSecret()) as JwtPayload;

    if (payload.type !== 'access') {
      throw new UnauthorizedException('Token inválido para acesso.');
    }

    if (!this.sessionStore.isActive(payload.sid)) {
      throw new UnauthorizedException('Sessão inválida ou expirada.');
    }

    req.auth = {
      email: payload.sub,
      sessionId: payload.sid,
    };

    next();
  }
}
