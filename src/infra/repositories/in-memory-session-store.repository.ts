import type { AuthSession } from '../../core/domain/application/Auth/auth-session';
import type { SessionStorePort } from '../../core/domain/repositories/session-store.repository';

// Adapter de persistência em memória (ideal para dev/testes; em produção usar Redis/DB).
export class InMemorySessionStoreRepository implements SessionStorePort {
  private readonly sessions = new Map<string, AuthSession>();

  create(session: AuthSession) {
    this.sessions.set(session.id, session);
    return session;
  }

  findById(id: string) {
    this.cleanupExpiredSessions();
    return this.sessions.get(id);
  }

  update(id: string, update: Partial<AuthSession>) {
    const current = this.findById(id);

    if (!current) return undefined;

    const next = { ...current, ...update };
    this.sessions.set(id, next);
    return next;
  }

  revoke(id: string) {
    const current = this.findById(id);

    if (!current) return undefined;

    const next = { ...current, revokedAt: Date.now() };
    this.sessions.set(id, next);
    return next;
  }

  isActive(id: string) {
    const session = this.findById(id);

    if (!session) return false;

    return !session.revokedAt && session.expiresAt > Date.now();
  }

  clear() {
    this.sessions.clear();
  }

  private cleanupExpiredSessions() {
    const now = Date.now();

    for (const [id, session] of this.sessions.entries()) {
      if (session.expiresAt <= now || session.revokedAt) {
        this.sessions.delete(id);
      }
    }
  }
}
