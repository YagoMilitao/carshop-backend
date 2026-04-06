import type { RequestHandler } from 'express';
import { HttpError } from '../../../core/domain/application/ApplicationError/http-error';
import type { TokenServicePort } from '../../../core/domain/application/Auth/token-service.port';
import type { SessionStorePort } from '../../../core/domain/repositories/session-store.repository';

// Middleware de autorização por JWT para rotas protegidas.
export function buildAuthMiddleware(
  sessionStore: SessionStorePort,
  tokenService: TokenServicePort,
): RequestHandler {
  return (request, _response, next) => {
    try {
      const authorization = request.headers.authorization;
      const token = authorization?.startsWith('Bearer ')
        ? authorization.slice('Bearer '.length)
        : undefined;

      if (!token) {
        throw new HttpError(401, 'Token de acesso ausente.');
      }

      const payload = tokenService.verify(token);

      if (payload.type !== 'access') {
        throw new HttpError(401, 'Token inválido para acesso.');
      }

      if (!sessionStore.isActive(payload.sid)) {
        throw new HttpError(401, 'Sessão inválida ou expirada.');
      }

      request.auth = {
        email: payload.sub,
        sessionId: payload.sid,
      };

      next();
    } catch (error) {
      next(error);
    }
  };
}
