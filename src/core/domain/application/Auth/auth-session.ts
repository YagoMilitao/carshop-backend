// Entidade central do domínio de autenticação para representar uma sessão ativa.
export interface AuthSession {
  id: string;
  email: string;
  refreshTokenHash: string;
  csrfToken: string;
  expiresAt: number;
  revokedAt?: number;
}
