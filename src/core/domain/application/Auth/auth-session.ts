/**
 * Representa a sessão autenticada persistida no repositório.
 *
 * Motivo:
 * centralizar o formato de sessão em um único tipo
 * e evitar divergência entre service, middleware e repositórios.
 */

// Entidade central do domínio de autenticação para representar uma sessão ativa.
export interface AuthSession {
  id: string;
  email: string;
  refreshTokenHash: string;
  csrfToken: string;
  expiresAt: number;
  revokedAt?: number;
}
