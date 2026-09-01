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

export const env: Environment = {
  port: getPort(),
  nodeEnv: getNodeEnv(),
  corsOrigins: getCorsOrigins(),
  mongoUri: getRequiredEnv('MONGO_URI'),
  jwtSecret: getRequiredEnv('JWT_SECRET'),
  jwtExpiresIn: process.env.JWT_EXPIRES_IN ?? '15m',
  jwtRefreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN ?? '7d',
  adminEmail: getRequiredEnv('ADMIN_EMAIL'),
  adminPassword: getRequiredEnv('ADMIN_PASSWORD'),
  workHardDeleteAfterDays: getWorkHardDeleteAfterDaysEnv(),
  trustProxyHops: getTrustProxyHopsEnv(),
};
