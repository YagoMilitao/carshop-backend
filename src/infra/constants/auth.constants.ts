import type { StringValue } from 'ms';

/**
 * Tipo aceito para duração de token/cookie.
 *
 * number:
 *   normalmente segundos ou milissegundos, dependendo de quem consome.
 *
 * StringValue:
 *   formatos como "15m", "7d", "1h".
 */
type DurationValue = number | StringValue;

/**
 * Converte uma string do ambiente em duração tipada.
 *
 * Regras:
 * - se não existir valor, usa o fallback
 * - se for número válido, retorna number
 * - caso contrário, assume string de duração válida ("15m", "7d", etc.)
 *
 * Motivo:
 * - manter flexibilidade
 * - evitar `string` genérica espalhada
 * - melhorar compatibilidade com jsonwebtoken
 */
function getDuration(
  value: string | undefined,
  fallback: DurationValue,
): DurationValue {
  if (!value || value.trim().length === 0) {
    return fallback;
  }

  const asNumber = Number(value);

  if (!Number.isNaN(asNumber)) {
    return asNumber;
  }

  return value as StringValue;
}

/**
 * Centraliza a leitura do segredo JWT.
 *
 * Motivo:
 * - evitar process.env espalhado
 * - manter um único ponto de manutenção
 *
 * Observação:
 * o fallback ajuda no desenvolvimento local,
 * mas em produção o ideal é sempre exigir JWT_SECRET real.
 */
export function getJwtSecret(): string {
  return process.env.JWT_SECRET ?? 'dev-secret-change-me';
}

/**
 * Expiração do access token.
 *
 * Access token deve ser curto para reduzir impacto em caso de vazamento.
 */
export function getAccessTokenExpiresIn(): DurationValue {
  return getDuration(process.env.JWT_EXPIRES_IN, '15m');
}

/**
 * Expiração do refresh token.
 *
 * Refresh token costuma durar mais do que o access token.
 */
export function getRefreshTokenExpiresIn(): DurationValue {
  return getDuration(process.env.JWT_REFRESH_EXPIRES_IN, '7d');
}

/**
 * Nome do cookie de refresh token.
 */
export function getRefreshCookieName(): string {
  return 'refresh_token';
}

/**
 * Nome do cookie CSRF.
 */
export function getCsrfCookieName(): string {
  return 'csrf_token';
}

/**
 * Nome do cookie que guarda o identificador da sessão.
 *
 * Motivo:
 * seu fluxo atual de refresh/logout depende do session_id.
 */
export function getSessionCookieName(): string {
  return 'session_id';
}
