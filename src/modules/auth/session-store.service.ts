import { Injectable } from '@nestjs/common';

export interface AuthSession {
  id: string;
  email: string;
  refreshTokenHash: string;
  csrfToken: string;
  expiresAt: number;
  revokedAt?: number;
}

@Injectable()
export class SessionStoreService {
  private readonly sessions = new Map<string, AuthSession>();

  // Cria e armazena uma nova sessão ativa em memória.
  create(session: AuthSession) {
    this.sessions.set(session.id, session);
    return session;
  }

  // Busca uma sessão por id e limpa sessões vencidas antes de responder.
  findById(id: string) {
    this.cleanupExpiredSessions();
    return this.sessions.get(id);
  }

  // Atualiza dados de uma sessão existente, como rotação de refresh token e CSRF.
  update(id: string, update: Partial<AuthSession>) {
    const current = this.findById(id);

    if (!current) return undefined;

    const next = { ...current, ...update };
    this.sessions.set(id, next);
    return next;
  }

  // Revoga explicitamente a sessão para impedir novo uso após logout.
  revoke(id: string) {
    const current = this.findById(id);

    if (!current) return undefined;

    const next = { ...current, revokedAt: Date.now() };
    this.sessions.set(id, next);
    return next;
  }

  // Indica se a sessão ainda está ativa e não foi revogada.
  isActive(id: string) {
    const session = this.findById(id);

    if (!session) return false;

    return !session.revokedAt && session.expiresAt > Date.now();
  }

  // Limpa o estado em memória, útil principalmente para testes.
  clear() {
    this.sessions.clear();
  }

  // Remove sessões expiradas ou revogadas para manter o armazenamento enxuto.
  private cleanupExpiredSessions() {
    const now = Date.now();

    for (const [id, session] of this.sessions.entries()) {
      if (session.expiresAt <= now || session.revokedAt) {
        this.sessions.delete(id);
      }
    }
  }
}
