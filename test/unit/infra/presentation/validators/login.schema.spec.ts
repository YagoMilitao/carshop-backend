import { loginSchema } from '../../../../../src/infra/presentation/validators/login.schema';

describe('loginSchema', () => {
  it('aceita um payload válido (happy path)', () => {
    const result = loginSchema.safeParse({
      email: 'admin@example.com',
      password: 'super-secret',
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toEqual({
        email: 'admin@example.com',
        password: 'super-secret',
      });
    }
  });

  it('rejeita quando email está ausente', () => {
    const result = loginSchema.safeParse({
      password: 'super-secret',
    });

    expect(result.success).toBe(false);
  });

  it('rejeita quando password está ausente', () => {
    const result = loginSchema.safeParse({
      email: 'admin@example.com',
    });

    expect(result.success).toBe(false);
  });

  it('rejeita formato de email inválido', () => {
    const result = loginSchema.safeParse({
      email: 'not-an-email',
      password: 'super-secret',
    });

    expect(result.success).toBe(false);
  });

  it('rejeita senha composta apenas por espaços em branco', () => {
    const result = loginSchema.safeParse({
      email: 'admin@example.com',
      password: '    ',
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toBe('Senha obrigatória.');
    }
  });

  it('rejeita propriedade desconhecida (.strict())', () => {
    const result = loginSchema.safeParse({
      email: 'admin@example.com',
      password: 'super-secret',
      extraField: 'not allowed',
    });

    expect(result.success).toBe(false);
  });

  it('preserva o valor exato da senha, sem aplicar trim (NFR-001 / comparação segura no AuthService)', () => {
    const result = loginSchema.safeParse({
      email: 'admin@example.com',
      password: '  super-secret  ',
    });

    expect(result.success).toBe(true);
    if (result.success) {
      // A senha não deve ser normalizada/trimada: o valor exato enviado
      // pelo cliente precisa chegar intacto à comparação feita pelo
      // AuthService. Somente o email é normalizado com trim().
      expect(result.data.password).toBe('  super-secret  ');
    }
  });

  it('aplica trim ao email, mas não à senha', () => {
    const result = loginSchema.safeParse({
      email: '  admin@example.com  ',
      password: 'super-secret',
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.email).toBe('admin@example.com');
      expect(result.data.password).toBe('super-secret');
    }
  });
});
