import { randomUUID } from 'crypto';
import { expect, describe, it } from '@jest/globals';
import { AuthSessionModel } from '../../../../src/data/models/auth-session.model';

function buildValidSession() {
  return {
    id: randomUUID(),
    email: 'admin@example.com',
    csrfToken: 'csrf-token-value',
    refreshTokenHash: 'refresh-token-hash',
    expiresAt: Date.now() + 60_000,
  };
}

describe('AuthSessionModel', () => {
  it('deve validar uma sessão válida', async () => {
    const document = new AuthSessionModel(buildValidSession());

    await expect(document.validate()).resolves.toBeUndefined();
    expect(document.email).toBe('admin@example.com');
    expect(document.revokedAt).toBeUndefined();
  });

  it('deve normalizar o email para minúsculo', async () => {
    const document = new AuthSessionModel({
      ...buildValidSession(),
      email: 'ADMIN@EXAMPLE.COM',
    });

    await document.validate();

    expect(document.email).toBe('admin@example.com');
  });

  it('deve exigir campos obrigatórios', async () => {
    const session = buildValidSession();
    const withoutRefreshTokenHash = { ...session } as Partial<
      typeof session
    >;
    delete withoutRefreshTokenHash.refreshTokenHash;
    const document = new AuthSessionModel(withoutRefreshTokenHash);

    await expect(document.validate()).rejects.toThrow();
  });

  it('deve definir índice único para id', () => {
    const idPath = AuthSessionModel.schema.path('id') as {
      options?: { unique?: boolean };
    };

    expect(idPath.options?.unique).toBe(true);
  });
});
