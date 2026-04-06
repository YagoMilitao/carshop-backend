import type { AuthenticatedRequestContext } from '../core/domain/application/Auth/auth.types';

declare global {
  namespace Express {
    interface Request {
      auth?: AuthenticatedRequestContext;
    }
  }
}

export {};
