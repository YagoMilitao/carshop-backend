import type { AuthenticatedRequestContext } from '../../core/domain/application/Auth/auth.types';

/**
 * Faz o declaration merging do Express para adicionar
 * o campo `auth` no objeto Request.
 *
 * Motivo:
 * permitir que middlewares adicionem dados ao request
 * de forma tipada e segura.
 */
declare global {
  namespace Express {
    interface Request {
      auth?: AuthenticatedRequestContext;
    }
  }
}

export {};
