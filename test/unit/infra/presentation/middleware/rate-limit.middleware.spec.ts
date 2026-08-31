import { createHash } from 'node:crypto';
import {
  buildLoginRateLimitKey,
  globalRateLimitMiddleware,
  loginRateLimitMiddleware,
} from '../../../../../src/infra/presentation/middleware/rate-limit.middleware';

describe('globalRateLimitMiddleware', () => {
  it('exporta um middleware Express (função) configurado', () => {
    expect(typeof globalRateLimitMiddleware).toBe('function');
    expect(globalRateLimitMiddleware).toHaveLength(3);
  });
});

describe('loginRateLimitMiddleware (CARSHOP-108, FR-001/FR-002/FR-003)', () => {
  it('exporta um middleware Express (função) configurado', () => {
    expect(typeof loginRateLimitMiddleware).toBe('function');
    expect(loginRateLimitMiddleware).toHaveLength(3);
  });
});

describe('buildLoginRateLimitKey (CARSHOP-108, FR-006/NFR-002, AC-004)', () => {
  const email = 'Admin@Example.com';
  const normalizedEmail = 'admin@example.com';
  const expectedHash = createHash('sha256')
    .update(normalizedEmail)
    .digest('hex');

  it('produz a mesma chave para o mesmo IP e e-mail', () => {
    const first = buildLoginRateLimitKey('127.0.0.1', email);
    const second = buildLoginRateLimitKey('127.0.0.1', email);

    expect(first).toBe(second);
  });

  it('normaliza o e-mail (trim + lowercase) antes de gerar a chave', () => {
    const withPadding = buildLoginRateLimitKey('127.0.0.1', '  Admin@Example.com  ');
    const normalized = buildLoginRateLimitKey('127.0.0.1', normalizedEmail);

    expect(withPadding).toBe(normalized);
  });

  it('gera chaves diferentes para IPs diferentes com o mesmo e-mail', () => {
    const first = buildLoginRateLimitKey('127.0.0.1', email);
    const second = buildLoginRateLimitKey('10.0.0.1', email);

    expect(first).not.toBe(second);
  });

  it('gera chaves diferentes para e-mails diferentes no mesmo IP', () => {
    const first = buildLoginRateLimitKey('127.0.0.1', 'user-one@example.com');
    const second = buildLoginRateLimitKey('127.0.0.1', 'user-two@example.com');

    expect(first).not.toBe(second);
  });

  it('usa um sentinel estável quando o e-mail está ausente ou não é string', () => {
    const withUndefined = buildLoginRateLimitKey('127.0.0.1', undefined);
    const withNumber = buildLoginRateLimitKey('127.0.0.1', 12345);
    const withEmptyString = buildLoginRateLimitKey('127.0.0.1', '   ');

    expect(withUndefined).toBe(withNumber);
    expect(withUndefined).toBe(withEmptyString);
    expect(withUndefined).toContain('no-email');
  });

  it('nunca contém o e-mail bruto na chave gerada (AC-004)', () => {
    const key = buildLoginRateLimitKey('127.0.0.1', email);

    expect(key).not.toContain(email);
    expect(key).not.toContain(normalizedEmail);
    expect(key).toContain(expectedHash);
  });
});
