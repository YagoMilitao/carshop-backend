import type { AuthenticatedRequestContext } from '../modules/auth/domain/types/auth.types';

declare global {
  namespace Express {
    interface Request {
      auth?: AuthenticatedRequestContext;
    }
  }
}

export {};
