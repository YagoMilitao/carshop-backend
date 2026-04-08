import type { JwtPayload, TokenType } from './auth.types';

/**
 * Dados necessários para assinar um token JWT da aplicação.
 *
 * sub:
 *   representa o usuário autenticado (neste caso, o email do admin).
 *
 * sid:
 *   identificador da sessão associada ao token.
 *
 * type:
 *   define se o token é de acesso ou de renovação.
 */
export interface SignTokenInput {
  sub: string;
  sid: string;
  type: TokenType;
}

/**
 * Porta criptográfica para geração e validação de JWT.
 *
 * Motivo:
 * a camada de aplicação não deve depender diretamente
 * da biblioteca concreta usada para tokens.
 */
export interface TokenServicePort {
  /**
   * Assina um novo token com base no payload informado.
   */
  sign(payload: SignTokenInput): string;

  /**
   * Valida e decodifica um token existente.
   */
  verify(token: string): JwtPayload;
}
