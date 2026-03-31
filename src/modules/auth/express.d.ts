import type { AuthenticatedRequestContext } from './auth.types';

declare global {
  namespace Express {
    interface Request {
      auth?: AuthenticatedRequestContext;
    }
  }
}

export {};
