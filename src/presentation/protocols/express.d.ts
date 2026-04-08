import 'express';

declare module 'express-serve-static-core' {
  interface Request {
    auth?: {
      email: string;
      sessionId: string;
    };
  }
}
