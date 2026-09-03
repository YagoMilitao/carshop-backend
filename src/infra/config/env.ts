import 'dotenv/config';

/**
 * Tipagem central das variáveis de ambiente utilizadas pela aplicação.
 */
export type Environment = {
  port: number;
  nodeEnv: 'development' | 'test' | 'production';
  corsOrigins: string[];
  mongoUri: string;
  jwtSecret: string;
  jwtExpiresIn: string;
  jwtRefreshExpiresIn: string;
  adminEmail: string;
  adminPassword: string;
  workHardDeleteAfterDays: number;
  trustProxyHops: number;
};

/**
 * Tamanho mínimo aceito para "JWT_SECRET" em produção (CARSHOP-110).
 *
 * Motivo:
 * 32 caracteres equivalem, aproximadamente, a 256 bits de entropia quando
 * gerados a partir de um conjunto de caracteres suficientemente aleatório —
 * um mínimo alinhado a boas práticas (OWASP) para segredos de assinatura
 * HMAC de JWT.
 */
const JWT_SECRET_MIN_LENGTH = 32;

/**
 * Tamanho mínimo aceito para "ADMIN_PASSWORD" em produção (CARSHOP-110).
 */
const ADMIN_PASSWORD_MIN_LENGTH = 12;

/**
 * Lista de valores fracos/padrão conhecidos, rejeitados para
 * "ADMIN_PASSWORD" em produção (CARSHOP-110).
 *
 * Comparação feita em minúsculas e após remover espaços nas extremidades.
 */
const ADMIN_PASSWORD_DENYLIST: ReadonlySet<string> = new Set([
  '123456',
  '12345678',
  'password',
  'admin',
  'admin123',
  'changeme',
  'senha123',
  'qwerty',
  'letmein',
  'password123!',
]);

/**
 * Duração máxima aceita para o token de acesso (JWT_EXPIRES_IN): 1 hora.
 */
const ACCESS_TOKEN_MAX_DURATION_MS = 60 * 60 * 1000;

/**
 * Duração máxima aceita para o refresh token (JWT_REFRESH_EXPIRES_IN): 30 dias.
 */
const REFRESH_TOKEN_MAX_DURATION_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * Garante que "JWT_SECRET" tenha tamanho mínimo suficiente em produção.
 *
 * Motivo:
 * um segredo curto compromete a segurança da assinatura dos tokens JWT.
 * Fora de produção, não bloqueia para preservar fluxos de desenvolvimento/teste.
 */
function assertJwtSecretStrength(
  nodeEnv: Environment['nodeEnv'],
  jwtSecret: string,
): void {
  if (nodeEnv !== 'production') {
    return;
  }

  if (jwtSecret.length < JWT_SECRET_MIN_LENGTH) {
    throw new Error(
      `A variável "JWT_SECRET" precisa ter pelo menos ${JWT_SECRET_MIN_LENGTH} caracteres em produção.`,
    );
  }
}

/**
 * Garante que "ADMIN_PASSWORD" atenda à política mínima de senha e não
 * esteja na lista de valores fracos/padrão conhecidos, em produção.
 *
 * Motivo:
 * protege a única conta administrativa privilegiada do sistema. A mensagem
 * de erro é genérica de propósito, para não revelar qual sub-regra falhou.
 */
function assertAdminPasswordPolicy(
  nodeEnv: Environment['nodeEnv'],
  adminPassword: string,
): void {
  if (nodeEnv !== 'production') {
    return;
  }

  const normalized = adminPassword.trim().toLowerCase();

  const hasMinLength = adminPassword.length >= ADMIN_PASSWORD_MIN_LENGTH;
  const hasUppercase = /[A-Z]/.test(adminPassword);
  const hasLowercase = /[a-z]/.test(adminPassword);
  const hasDigit = /\d/.test(adminPassword);
  const hasSymbol = /[^A-Za-z0-9]/.test(adminPassword);
  const isDenylisted = ADMIN_PASSWORD_DENYLIST.has(normalized);

  const meetsPolicy =
    hasMinLength && hasUppercase && hasLowercase && hasDigit && hasSymbol;

  if (!meetsPolicy || isDenylisted) {
    throw new Error(
      'A variável "ADMIN_PASSWORD" não atende à política mínima de senha exigida em produção.',
    );
  }
}

/**
 * Converte uma string de duração para milissegundos.
 *
 * Formatos aceitos:
 * - inteiro puro (interpretado como segundos), ex.: "60";
 * - "<número><unidade>", unidade em ms|s|m|h|d (case-insensitive),
 *   ex.: "15m", "7d", "5s", "1h".
 */
function parseDurationToMs(name: string, raw: string): number {
  const trimmed = raw.trim();
  const match = /^(\d+)(ms|s|m|h|d)?$/i.exec(trimmed);

  if (!match) {
    throw new Error(`A variável "${name}" precisa ser uma duração válida.`);
  }

  const amount = Number(match[1]);
  const unit = (match[2] ?? 's').toLowerCase();

  const unitToMs: Record<string, number> = {
    ms: 1,
    s: 1000,
    m: 60 * 1000,
    h: 60 * 60 * 1000,
    d: 24 * 60 * 60 * 1000,
  };

  return amount * unitToMs[unit];
}

/**
 * Garante que uma duração seja válida e não exceda o teto configurado.
 *
 * Motivo:
 * limita o raio de impacto de um token vazado, e evita erros de configuração
 * (typos) em qualquer ambiente, não apenas em produção.
 */
function assertBoundedDuration(name: string, raw: string, maxMs: number): void {
  const durationMs = parseDurationToMs(name, raw);

  if (durationMs <= 0 || durationMs > maxMs) {
    throw new Error(`A variável "${name}" precisa ser uma duração válida.`);
  }
}

/**
 * Garante que, em produção, "CORS_ORIGIN" contenha ao menos uma origem
 * HTTPS absoluta e explícita, sem curinga.
 *
 * Motivo:
 * protege a precondição do CSRF double-submit e evita configurações
 * permissivas/inseguras de CORS em produção.
 */
function assertProductionCorsOrigins(
  nodeEnv: Environment['nodeEnv'],
  origins: string[],
): void {
  if (nodeEnv !== 'production') {
    return;
  }

  if (origins.length === 0) {
    throw new Error(
      'A variável "CORS_ORIGIN" precisa conter ao menos uma origem HTTPS válida em produção.',
    );
  }

  for (const origin of origins) {
    if (origin.includes('*')) {
      throw new Error(
        'A variável "CORS_ORIGIN" precisa conter ao menos uma origem HTTPS válida em produção.',
      );
    }

    let parsed: URL;

    try {
      parsed = new URL(origin);
    } catch {
      throw new Error(
        'A variável "CORS_ORIGIN" precisa conter ao menos uma origem HTTPS válida em produção.',
      );
    }

    if (parsed.protocol !== 'https:') {
      throw new Error(
        'A variável "CORS_ORIGIN" precisa conter ao menos uma origem HTTPS válida em produção.',
      );
    }
  }
}

/**
 * Lê uma variável obrigatória do ambiente.
 *
 * Motivo:
 * falhar no startup é melhor do que descobrir o problema no meio de uma request.
 */
function getRequiredEnv(name: string): string {
  const value = process.env[name];

  if (!value || value.trim().length === 0) {
    throw new Error(`A variável de ambiente "${name}" é obrigatória.`);
  }

  return value;
}

/**
 * Converte e valida a porta da aplicação.
 */
function getPort(): number {
  const rawPort = process.env.PORT ?? '3000';
  const port = Number(rawPort);

  if (Number.isNaN(port) || port <= 0) {
    throw new Error('A variável "PORT" precisa ser um número válido.');
  }

  return port;
}

/**
 * Converte e valida o período de retenção (em dias) usado pela rotina
 * de expurgo definitivo de works removidos logicamente.
 */
function getWorkHardDeleteAfterDaysEnv(): number {
  const rawDays = process.env.WORK_HARD_DELETE_AFTER_DAYS ?? '90';
  const days = Number(rawDays);

  if (!Number.isInteger(days) || days <= 0) {
    throw new Error(
      'A variável "WORK_HARD_DELETE_AFTER_DAYS" precisa ser um número inteiro positivo.',
    );
  }

  return days;
}

/**
 * Converte e valida o número de "hops" de proxy confiáveis à frente da
 * aplicação, usado para configurar o `trust proxy` do Express.
 *
 * Motivo:
 * o valor precisa refletir a topologia real de deploy para que a
 * resolução do IP do cliente usada pelo rate limiting não seja
 * trivialmente falsificável via `X-Forwarded-For` forjado, nem agrupe
 * clientes distintos atrás do mesmo proxy em um único bucket.
 *
 * Padrão: 0 (não confia em proxies). Deploys atrás de proxies reversos
 * devem configurar explicitamente o valor conforme a topologia validada.
 */
function getTrustProxyHopsEnv(): number {
  const rawHops = process.env.TRUST_PROXY_HOPS ?? '0';
  const hops = Number(rawHops);

  if (!Number.isInteger(hops) || hops < 0) {
    throw new Error(
      'A variável "TRUST_PROXY_HOPS" precisa ser um número inteiro maior ou igual a zero.',
    );
  }

  return hops;
}

/**
 * Normaliza o ambiente da aplicação.
 */
function getNodeEnv(): Environment['nodeEnv'] {
  const rawNodeEnv = process.env.NODE_ENV ?? 'development';

  if (
    rawNodeEnv !== 'development' &&
    rawNodeEnv !== 'test' &&
    rawNodeEnv !== 'production'
  ) {
    throw new Error(
      'A variável "NODE_ENV" precisa ser development, test ou production.',
    );
  }

  return rawNodeEnv;
}

/**
 * Lê e normaliza as origens permitidas no CORS.
 *
 * Exemplo:
 * CORS_ORIGIN=http://localhost:3000,https://meusite.com
 */
function getCorsOrigins(): string[] {
  const raw = process.env.CORS_ORIGIN;

  if (!raw) {
    return [];
  }

  return raw
    .split(',')
    .map((value) => value.trim())
    .filter((value) => value.length > 0);
}

const port = getPort();
const nodeEnv = getNodeEnv();

const corsOrigins = getCorsOrigins();
assertProductionCorsOrigins(nodeEnv, corsOrigins);

const mongoUri = getRequiredEnv('MONGO_URI');

const jwtSecret = getRequiredEnv('JWT_SECRET');
assertJwtSecretStrength(nodeEnv, jwtSecret);

const jwtExpiresIn = process.env.JWT_EXPIRES_IN ?? '15m';
assertBoundedDuration(
  'JWT_EXPIRES_IN',
  jwtExpiresIn,
  ACCESS_TOKEN_MAX_DURATION_MS,
);

const jwtRefreshExpiresIn = process.env.JWT_REFRESH_EXPIRES_IN ?? '7d';
assertBoundedDuration(
  'JWT_REFRESH_EXPIRES_IN',
  jwtRefreshExpiresIn,
  REFRESH_TOKEN_MAX_DURATION_MS,
);

const adminEmail = getRequiredEnv('ADMIN_EMAIL');

const adminPassword = getRequiredEnv('ADMIN_PASSWORD');
assertAdminPasswordPolicy(nodeEnv, adminPassword);

const workHardDeleteAfterDays = getWorkHardDeleteAfterDaysEnv();
const trustProxyHops = getTrustProxyHopsEnv();

export const env: Environment = {
  port,
  nodeEnv,
  corsOrigins,
  mongoUri,
  jwtSecret,
  jwtExpiresIn,
  jwtRefreshExpiresIn,
  adminEmail,
  adminPassword,
  workHardDeleteAfterDays,
  trustProxyHops,
};
