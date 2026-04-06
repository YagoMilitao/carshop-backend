function getDuration(value: string | undefined, fallback: string | number) {
  if (!value) return fallback;

  const asNumber = Number(value);
  if (!Number.isNaN(asNumber)) return asNumber;

  return value;
}

// Centraliza a leitura do segredo JWT e aplica um fallback seguro para dev.
export function getJwtSecret() {
  return process.env.JWT_SECRET ?? 'dev-secret-change-me';
}

// Define a expiração do access token, priorizando configuração por ambiente.
export function getAccessTokenExpiresIn() {
  return getDuration(process.env.JWT_EXPIRES_IN, '15m');
}

// Define a expiração do refresh token, separada do access token.
export function getRefreshTokenExpiresIn() {
  return getDuration(process.env.JWT_REFRESH_EXPIRES_IN, '7d');
}

// Mantém o nome do cookie de refresh em um único ponto para evitar inconsistência.
export function getRefreshCookieName() {
  return 'refresh_token';
}

// Mantém o nome do cookie CSRF centralizado para leitura e escrita consistentes.
export function getCsrfCookieName() {
  return 'csrf_token';
}
