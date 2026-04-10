import type { AuthSession } from '../../core/domain/application/Auth/auth-session';
import type { SessionStorePort } from '../../core/domain/repositories/session-store.repository';

export class InMemorySessionStoreRepository implements SessionStorePort {
  private readonly sessions = new Map<string, AuthSession>();

  async create(session: AuthSession): Promise<AuthSession> {
    await Promise.resolve();
    this.sessions.set(session.id, session);
    return session;
  }

  async findById(id: string): Promise<AuthSession | undefined> {
    await Promise.resolve();
    return this.sessions.get(id);
  }

  async update(
    id: string,
    update: Partial<AuthSession>,
  ): Promise<AuthSession | undefined> {
    await Promise.resolve();
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

  async revoke(id: string): Promise<AuthSession | undefined> {
    await Promise.resolve();
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

  async isActive(id: string): Promise<boolean> {
    await Promise.resolve();
    const session = this.sessions.get(id);

    if (!session) {
      return false;
    }

    if (typeof session.revokedAt === 'number') {
      return false;
    }

    return session.expiresAt > Date.now();
  }

  async clear(): Promise<void> {
    await Promise.resolve();
    this.sessions.clear();
  }
}
