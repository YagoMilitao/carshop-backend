import type { AuthenticatedRequestContext } from '../../core/domain/application/Auth/auth.types';

/**
 * Declaration merging do Express para adicionar `request.auth`.
 *
 * Motivo:
 * permitir que o auth middleware anexe contexto autenticado
 * sem precisar usar `any` ou non-null assertion desnecessária.
 */
declare global {
  namespace Express {
    interface Request {
      auth?: AuthenticatedRequestContext;
    }
  }
}

export {};
