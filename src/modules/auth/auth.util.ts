import type { StringValue } from 'ms';
import crypto from 'crypto';

/**
 * Converte "15m", "7d" etc em milissegundos (para cookies).
 * Usamos uma abordagem simples para suportar s/m/h/d.
 */
export function durationToMs(value: string): number {
  const match = value.trim().match(/^(\d+)(s|m|h|d)$/i);
  if (!match)
    throw new Error(`Formato inválido de duração: ${value} (use ex: 15m, 7d)`);

  const amount = Number(match[1]);
  const unit = match[2].toLowerCase();

  const multipliers: Record<string, number> = {
    s: 1000,
    m: 60_000,
    h: 3_600_000,
    d: 86_400_000,
  };

  return amount * multipliers[unit];
}

/**
 * Gera token aleatório seguro para CSRF (double submit) e refresh.
 * crypto.randomBytes é criptograficamente seguro.
 */
export function randomToken(bytes = 32) {
  return crypto.randomBytes(bytes).toString('hex');
}

export function getAccessExpiresIn(): StringValue {
  return (process.env.JWT_ACCESS_EXPIRES_IN ?? '15m') as StringValue;
}

export function getRefreshExpiresIn(): StringValue {
  return (process.env.JWT_REFRESH_EXPIRES_IN ?? '7d') as StringValue;
}
