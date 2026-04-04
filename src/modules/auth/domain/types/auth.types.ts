export type TokenType = 'access' | 'refresh';

// Payload de JWT aceito pelas regras de domínio da autenticação.
export interface JwtPayload {
  sub: string;
  sid: string;
  type: TokenType;
  jti?: string;
  iat?: number;
  exp?: number;
}

// Contexto de autenticação anexado ao request após middleware de JWT.
export interface AuthenticatedRequestContext {
  email: string;
  sessionId: string;
}
