import { HttpError } from '../../../../../shared/errors/http-error';

export interface LoginInput {
  email: string;
  password: string;
}

function isEmail(value: string) {
  // RFC 5321: local-part max 64 chars, domain max 255 chars
  // Limited quantifiers prevent ReDoS attacks via backtracking
  return /^[^\s@]{1,64}@[^\s@]{1,255}\.[^\s@]+$/.test(value);
}

// Validação de entrada HTTP para login sem decorators/framework.
export function validateLoginPayload(payload: unknown): LoginInput {
  if (!payload || typeof payload !== 'object') {
    throw new HttpError(400, 'Body de login inválido.');
  }

  const maybeInput = payload as Partial<LoginInput>;
  const email = maybeInput.email?.trim();
  const password = maybeInput.password;

  if (!email || !isEmail(email)) {
    throw new HttpError(400, 'Email inválido.');
  }

  if (typeof password !== 'string' || password.trim().length === 0) {
    throw new HttpError(400, 'Senha obrigatória.');
  }

  return { email, password };
}
