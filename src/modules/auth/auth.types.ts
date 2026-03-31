export interface JwtPayload {
  sub: string;
  sid: string;
  type: 'access' | 'refresh';
  jti?: string;
  iat?: number;
  exp?: number;
}

export interface AuthenticatedRequestContext {
  email: string;
  sessionId: string;
}
