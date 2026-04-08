import 'dotenv/config';

/**
 * Tipagem do ambiente da aplicação.
 *
 * Motivo:
 * - deixar explícito quais variáveis o sistema usa
 * - melhorar autocomplete
 * - evitar trabalhar com valores soltos e pouco previsíveis
 */
export type Environment = {
  port: number;
  nodeEnv: 'development' | 'test' | 'production';
  frontendUrl: string;
  jwtSecret: string;
  jwtAccessExpiresIn: string;
  jwtRefreshExpiresIn: string;
  adminEmail: string;
  adminPassword: string;
  mongoUri: string;
};

/**
 * Lê uma variável obrigatória do ambiente.
 *
 * Por que essa função existe?
 * Porque process.env sempre retorna string | undefined.
 * Se a variável não existir, é melhor falhar no startup
 * do que descobrir o erro só no meio de uma request.
 */
function getRequiredEnv(name: string): string {
  const value = process.env[name];

  if (!value || value.trim().length === 0) {
    throw new Error(`A variável de ambiente "${name}" é obrigatória.`);
  }

  return value;
}

/**
 * Converte a porta para number e valida o resultado.
 *
 * Motivo:
 * process.env sempre vem como string,
 * mas a aplicação precisa da porta como número.
 */
function getPort(): number {
  const rawPort = process.env.PORT ?? '3000';
  const port = Number(rawPort);

  if (Number.isNaN(port) || port <= 0) {
    throw new Error(
      'A variável de ambiente "PORT" precisa ser um número válido.',
    );
  }

  return port;
}

/**
 * Normaliza o NODE_ENV para os valores aceitos pela aplicação.
 *
 * Motivo:
 * restringir os ambientes válidos e evitar valores inesperados.
 */
function getNodeEnv(): Environment['nodeEnv'] {
  const rawNodeEnv = process.env.NODE_ENV ?? 'development';

  if (
    rawNodeEnv !== 'development' &&
    rawNodeEnv !== 'test' &&
    rawNodeEnv !== 'production'
  ) {
    throw new Error(
      'A variável de ambiente "NODE_ENV" precisa ser development, test ou production.',
    );
  }

  return rawNodeEnv;
}

/**
 * Objeto central com todas as variáveis já tratadas.
 *
 * Motivo:
 * - concentrar configuração em um único lugar
 * - evitar process.env espalhado pelo sistema
 * - facilitar manutenção e testes
 */
export const env: Environment = {
  port: getPort(),
  nodeEnv: getNodeEnv(),
  frontendUrl: getRequiredEnv('FRONTEND_URL'),
  jwtSecret: getRequiredEnv('JWT_SECRET'),
  jwtAccessExpiresIn: getRequiredEnv('JWT_ACCESS_EXPIRES_IN'),
  jwtRefreshExpiresIn: getRequiredEnv('JWT_REFRESH_EXPIRES_IN'),
  adminEmail: getRequiredEnv('ADMIN_EMAIL'),
  adminPassword: getRequiredEnv('ADMIN_PASSWORD'),
  mongoUri: getRequiredEnv('MONGO_URI'),
};
