import type { RequestHandler } from 'express';
import { HttpError } from '../../../core/domain/application/ApplicationError/http-error';
import type { AuthenticatedRequestContext } from '../../../core/domain/application/Auth/auth.types';
import type { TokenServicePort } from '../../../core/domain/application/Auth/token-service.port';
import type { SessionStorePort } from '../../../core/domain/repositories/session-store.repository';

/**
 * Extrai o token Bearer do header Authorization.
 *
 * Exemplo esperado:
 * Authorization: Bearer <token>
 *
 * Motivo:
 * isolar parsing do header e deixar o middleware mais legível.
 */
function extractBearerToken(
  authorizationHeader: string | undefined,
): string | undefined {
  if (!authorizationHeader?.startsWith('Bearer ')) {
    return undefined;
  }

  return authorizationHeader.slice('Bearer '.length);
}

/**
 * Constrói o contexto autenticado anexado ao request.
 *
 * Motivo:
 * manter esse mapeamento explícito e fortemente tipado.
 */
function buildAuthenticatedContext(
  email: string,
  sessionId: string,
): AuthenticatedRequestContext {
  return {
    email,
    sessionId,
  };
}

/**
 * Middleware de autorização por JWT para rotas protegidas.
 *
 * Responsabilidades:
 * - extrair o token do header Authorization
 * - validar o token JWT
 * - garantir que seja um access token
 * - garantir que a sessão associada ainda esteja ativa
 * - anexar contexto autenticado ao request
 */
export function buildAuthMiddleware(
  sessionStore: SessionStorePort,
  tokenService: TokenServicePort,
): RequestHandler {
  return (request, _response, next) => {
    try {
      const token = extractBearerToken(request.headers.authorization);

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

      request.auth = buildAuthenticatedContext(payload.sub, payload.sid);

      next();
    } catch (error) {
      next(error);
    }
  };
}
