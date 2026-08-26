import { randomUUID } from 'crypto';
import { expect, describe, it } from '@jest/globals';
import { AdminUserModel } from '../../../../src/data/models/admin-user.model';

function buildValidAdminUser() {
  return {
    id: randomUUID(),
    email: 'admin@example.com',
    passwordHash: 'hashed-password',
  };
}

describe('AdminUserModel', () => {
  it('deve validar um usuário admin válido', async () => {
    const document = new AdminUserModel(buildValidAdminUser());

    await expect(document.validate()).resolves.toBeUndefined();
    expect(document.email).toBe('admin@example.com');
    expect(document.isActive).toBe(true);
  });

  it('deve normalizar o email para minúsculo', async () => {
    const document = new AdminUserModel({
      ...buildValidAdminUser(),
      email: 'ADMIN@EXAMPLE.COM',
    });

    await document.validate();

    expect(document.email).toBe('admin@example.com');
  });

  it('deve exigir campos obrigatórios', async () => {
    const admin = buildValidAdminUser();
    const withoutPasswordHash = { ...admin } as Partial<typeof admin>;
    delete withoutPasswordHash.passwordHash;
    const document = new AdminUserModel(withoutPasswordHash);

    await expect(document.validate()).rejects.toThrow();
  });

  it('deve definir índice único para email', () => {
    const emailPath = AdminUserModel.schema.path('email') as {
      options?: { unique?: boolean };
    };

    expect(emailPath.options?.unique).toBe(true);
  });
});
