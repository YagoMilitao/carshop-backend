import type { AuthSession } from '../application/Auth/auth-session';

/**
 * Porta de saída para persistência e consulta de sessão.
 */
export interface SessionStorePort {
  create(session: AuthSession): Promise<AuthSession>;
  findById(id: string): Promise<AuthSession | undefined>;
  update(
    id: string,
    update: Partial<AuthSession>,
  ): Promise<AuthSession | undefined>;
  revoke(id: string): Promise<AuthSession | undefined>;
  isActive(id: string): Promise<boolean>;
  clear(): Promise<void>;
}
