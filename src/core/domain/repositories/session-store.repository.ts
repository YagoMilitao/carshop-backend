import type { AuthSession } from '../application/Auth/auth-session';

/**
 * Porta de saída para persistência e consulta de sessões.
 *
 * Motivo:
 * a camada de aplicação não deve saber se a sessão está
 * em memória, MongoDB, Redis ou qualquer outro mecanismo.
 */
export interface SessionStorePort {
  /**
   * Cria uma nova sessão.
   */
  create(session: AuthSession): AuthSession;

  /**
   * Busca uma sessão pelo identificador.
   */
  findById(id: string): AuthSession | undefined;

  /**
   * Atualiza parcialmente uma sessão existente.
   */
  update(id: string, update: Partial<AuthSession>): AuthSession | undefined;

  /**
   * Revoga uma sessão existente.
   */
  revoke(id: string): AuthSession | undefined;

  /**
   * Informa se a sessão está ativa.
   */
  isActive(id: string): boolean;

  /**
   * Limpa todas as sessões armazenadas.
   *
   * Útil principalmente para testes.
   */
  clear(): void;
}
