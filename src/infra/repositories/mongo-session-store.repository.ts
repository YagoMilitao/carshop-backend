import type { AuthSession } from '../../core/domain/application/Auth/auth-session';
import type { SessionStorePort } from '../../core/domain/repositories/session-store.repository';
import { AuthSessionModel } from '../../data/models/auth-session.model';

/**
 * Repositório de sessão usando MongoDB.
 *
 * Motivo:
 * substituir a implementação em memória por uma persistência real,
 * tornando o fluxo de autenticação compatível com produção.
 */
export class MongoSessionStoreRepository implements SessionStorePort {
  /**
   * Cria uma nova sessão no banco.
   */
  async create(session: AuthSession): Promise<AuthSession> {
    const created = await AuthSessionModel.create(session);

    return {
      id: created.id,
      email: created.email,
      csrfToken: created.csrfToken,
      refreshTokenHash: created.refreshTokenHash,
      expiresAt: created.expiresAt,
      revokedAt: created.revokedAt || undefined,
    };
  }

  /**
   * Busca uma sessão pelo id lógico da aplicação.
   */
  async findById(id: string): Promise<AuthSession | undefined> {
    const session = await AuthSessionModel.findOne({ id }).lean();

    if (!session) {
      return undefined;
    }

    return {
      id: session.id,
      email: session.email,
      csrfToken: session.csrfToken,
      refreshTokenHash: session.refreshTokenHash,
      expiresAt: session.expiresAt,
      revokedAt: session.revokedAt || undefined,
    };
  }

  /**
   * Atualiza parcialmente uma sessão existente.
   */
  async update(
    id: string,
    update: Partial<AuthSession>,
  ): Promise<AuthSession | undefined> {
    const updated = await AuthSessionModel.findOneAndUpdate({ id }, update, {
      new: true,
    }).lean();

    if (!updated) {
      return undefined;
    }

    return {
      id: updated.id,
      email: updated.email,
      csrfToken: updated.csrfToken,
      refreshTokenHash: updated.refreshTokenHash,
      expiresAt: updated.expiresAt,
      revokedAt: updated.revokedAt || undefined,
    };
  }

  /**
   * Revoga a sessão sem apagá-la.
   *
   * Motivo:
   * manter histórico lógico da sessão e evitar inconsistência futura.
   */
  async revoke(id: string): Promise<AuthSession | undefined> {
    const revoked = await AuthSessionModel.findOneAndUpdate(
      { id },
      { revokedAt: Date.now() },
      { new: true },
    ).lean();

    if (!revoked) {
      return undefined;
    }

    return {
      id: revoked.id,
      email: revoked.email,
      csrfToken: revoked.csrfToken,
      refreshTokenHash: revoked.refreshTokenHash,
      expiresAt: revoked.expiresAt,
      revokedAt: revoked.revokedAt || undefined,
    };
  }

  /**
   * Verifica se a sessão existe, não foi revogada
   * e ainda não expirou.
   */
  async isActive(id: string): Promise<boolean> {
    const session = await AuthSessionModel.findOne({ id }).lean();

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
   * Útil em testes.
   */
  async clear(): Promise<void> {
    await AuthSessionModel.deleteMany({});
  }
}
