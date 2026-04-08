import type { AuthSession } from '../../core/domain/application/Auth/auth-session';
import type { SessionStorePort } from '../../core/domain/repositories/session-store.repository';

/**
 * Implementação em memória do armazenamento de sessões.
 *
 * Motivo:
 * - simples para desenvolvimento
 * - útil para validar o fluxo de autenticação
 * - fácil de substituir depois por MongoDB ou Redis
 */
export class InMemorySessionStoreRepository implements SessionStorePort {
  private readonly sessions = new Map<string, AuthSession>();

  /**
   * Cria uma nova sessão.
   */
  create(session: AuthSession): AuthSession {
    this.sessions.set(session.id, session);
    return session;
  }

  /**
   * Busca uma sessão pelo id.
   */
  findById(id: string): AuthSession | undefined {
    return this.sessions.get(id);
  }

  /**
   * Atualiza parcialmente uma sessão já existente.
   */
  update(id: string, update: Partial<AuthSession>): AuthSession | undefined {
    const currentSession = this.sessions.get(id);

    if (!currentSession) {
      return undefined;
    }

    const nextSession: AuthSession = {
      ...currentSession,
      ...update,
    };

    this.sessions.set(id, nextSession);

    return nextSession;
  }

  /**
   * Revoga uma sessão sem apagar seu histórico.
   *
   * Motivo:
   * marcar a sessão como revogada é melhor do que simplesmente remover,
   * porque preserva estado e mantém o comportamento alinhado com futuras
   * implementações em banco.
   */
  revoke(id: string): AuthSession | undefined {
    const currentSession = this.sessions.get(id);

    if (!currentSession) {
      return undefined;
    }

    const revokedSession: AuthSession = {
      ...currentSession,
      revokedAt: Date.now(),
    };

    this.sessions.set(id, revokedSession);

    return revokedSession;
  }

  /**
   * Informa se a sessão existe, não foi revogada
   * e ainda não expirou.
   */
  isActive(id: string): boolean {
    const session = this.sessions.get(id);

    if (!session) {
      return false;
    }

    if (typeof session.revokedAt === 'number') {
      return false;
    }

    return session.expiresAt > Date.now();
  }

  /**
   * Limpa todas as sessões.
   *
   * Útil para testes automatizados.
   */
  clear(): void {
    this.sessions.clear();
  }
}
