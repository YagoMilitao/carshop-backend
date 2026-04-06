import type { AuthSession } from '../application/Auth/auth-session';

// Porta de saída para persistência e consulta de sessão (in-memory, Redis, DB, etc.).
export interface SessionStorePort {
  create(session: AuthSession): AuthSession;
  findById(id: string): AuthSession | undefined;
  update(id: string, update: Partial<AuthSession>): AuthSession | undefined;
  revoke(id: string): AuthSession | undefined;
  isActive(id: string): boolean;
  clear(): void;
}
