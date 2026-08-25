import { MongoSessionStoreRepository } from '../../../../src/infra/repositories/mongo-session-store.repository';
import type { AuthSession } from '../../../../src/core/domain/application/Auth/auth-session';

jest.mock('../../../../src/data/models/auth-session.model', () => ({
  AuthSessionModel: {
    create: jest.fn(),
    findOne: jest.fn(),
    findOneAndUpdate: jest.fn(),
    deleteMany: jest.fn(),
  },
}));

const authSessionModel = jest.requireMock(
  '../../../../src/data/models/auth-session.model',
);

describe('MongoSessionStoreRepository', () => {
  const repository = new MongoSessionStoreRepository();

  const session: AuthSession = {
    id: 'session-1',
    email: 'admin@example.com',
    csrfToken: 'csrf-token',
    refreshTokenHash: 'refresh-hash',
    expiresAt: Date.now() + 60_000,
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('cria uma sessão', async () => {
    authSessionModel.AuthSessionModel.create.mockResolvedValue({
      ...session,
      revokedAt: undefined,
    });

    const created = await repository.create(session);

    expect(authSessionModel.AuthSessionModel.create).toHaveBeenCalledWith(
      session,
    );
    expect(created).toEqual({ ...session, revokedAt: undefined });
  });

  it('busca uma sessão existente pelo id', async () => {
    authSessionModel.AuthSessionModel.findOne.mockReturnValue({
      lean: async () => ({ ...session, revokedAt: undefined }),
    });

    const found = await repository.findById('session-1');

    expect(authSessionModel.AuthSessionModel.findOne).toHaveBeenCalledWith({
      id: 'session-1',
    });
    expect(found).toEqual({ ...session, revokedAt: undefined });
  });

  it('retorna undefined quando a sessão não existe', async () => {
    authSessionModel.AuthSessionModel.findOne.mockReturnValue({
      lean: async () => null,
    });

    const found = await repository.findById('missing-session');

    expect(found).toBeUndefined();
  });

  it('atualiza uma sessão existente', async () => {
    authSessionModel.AuthSessionModel.findOneAndUpdate.mockReturnValue({
      lean: async () => ({ ...session, csrfToken: 'new-csrf' }),
    });

    const updated = await repository.update('session-1', {
      csrfToken: 'new-csrf',
    });

    expect(
      authSessionModel.AuthSessionModel.findOneAndUpdate,
    ).toHaveBeenCalledWith(
      { id: 'session-1' },
      { csrfToken: 'new-csrf' },
      { new: true },
    );
    expect(updated?.csrfToken).toBe('new-csrf');
  });

  it('retorna undefined ao atualizar sessão inexistente', async () => {
    authSessionModel.AuthSessionModel.findOneAndUpdate.mockReturnValue({
      lean: async () => null,
    });

    const updated = await repository.update('missing-session', {
      csrfToken: 'new-csrf',
    });

    expect(updated).toBeUndefined();
  });

  it('revoga uma sessão existente', async () => {
    authSessionModel.AuthSessionModel.findOneAndUpdate.mockReturnValue({
      lean: async () => ({ ...session, revokedAt: 123456 }),
    });

    const revoked = await repository.revoke('session-1');

    expect(
      authSessionModel.AuthSessionModel.findOneAndUpdate,
    ).toHaveBeenCalledWith(
      { id: 'session-1' },
      { revokedAt: expect.any(Number) },
      { new: true },
    );
    expect(revoked?.revokedAt).toBe(123456);
  });

  it('retorna undefined ao revogar sessão inexistente', async () => {
    authSessionModel.AuthSessionModel.findOneAndUpdate.mockReturnValue({
      lean: async () => null,
    });

    const revoked = await repository.revoke('missing-session');

    expect(revoked).toBeUndefined();
  });

  it('retorna false para isActive quando a sessão não existe', async () => {
    authSessionModel.AuthSessionModel.findOne.mockReturnValue({
      lean: async () => null,
    });

    const isActive = await repository.isActive('missing-session');

    expect(isActive).toBe(false);
  });

  it('retorna false para isActive quando a sessão foi revogada', async () => {
    authSessionModel.AuthSessionModel.findOne.mockReturnValue({
      lean: async () => ({ ...session, revokedAt: Date.now() }),
    });

    const isActive = await repository.isActive('session-1');

    expect(isActive).toBe(false);
  });

  it('retorna true para isActive quando a sessão está válida', async () => {
    authSessionModel.AuthSessionModel.findOne.mockReturnValue({
      lean: async () => ({
        ...session,
        expiresAt: Date.now() + 60_000,
        revokedAt: undefined,
      }),
    });

    const isActive = await repository.isActive('session-1');

    expect(isActive).toBe(true);
  });

  it('retorna false para isActive quando a sessão expirou', async () => {
    authSessionModel.AuthSessionModel.findOne.mockReturnValue({
      lean: async () => ({
        ...session,
        expiresAt: Date.now() - 60_000,
        revokedAt: undefined,
      }),
    });

    const isActive = await repository.isActive('session-1');

    expect(isActive).toBe(false);
  });

  it('limpa todas as sessões', async () => {
    await repository.clear();

    expect(authSessionModel.AuthSessionModel.deleteMany).toHaveBeenCalledWith(
      {},
    );
  });
});
