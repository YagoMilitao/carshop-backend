import type { JwtPayload, TokenType } from './auth.types';

export interface SignTokenInput {
  sub: string;
  sid: string;
  type: TokenType;
}

// Porta criptográfica para assinar e validar JWT sem acoplar domínio à biblioteca usada.
export interface TokenServicePort {
  sign(payload: SignTokenInput): string;
  verify(token: string): JwtPayload;
}
