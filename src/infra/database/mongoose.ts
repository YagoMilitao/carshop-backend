import mongoose from 'mongoose';

const ATLAS_IP_NOT_ALLOWED_HINTS = [
  "ip that isn't whitelisted",
  'not whitelisted',
  'network access list',
  'not allowed to access this mongodb atlas cluster',
  'add your current ip address',
];

function normalizeErrorMessage(error: unknown): string {
  const messages: string[] = [];
  const queue: unknown[] = [error];
  const visited = new Set<unknown>();

  while (queue.length > 0) {
    const current = queue.shift();

    if (!current) {
      continue;
    }

    if (typeof current === 'object' || typeof current === 'function') {
      if (visited.has(current)) {
        continue;
      }
      visited.add(current);
    }

    if (typeof current === 'string') {
      messages.push(current);
      continue;
    }

    if (current instanceof Error) {
      messages.push(current.message);
      const maybeCause = (current as Error & { cause?: unknown }).cause;
      if (maybeCause) {
        queue.push(maybeCause);
      }
      continue;
    }

    if (typeof current === 'object') {
      const candidate = current as Record<string, unknown>;

      if (typeof candidate.message === 'string') {
        messages.push(candidate.message);
      }

      if ('cause' in candidate) {
        queue.push(candidate.cause);
      }

      if ('reason' in candidate) {
        queue.push(candidate.reason);
      }
    }
  }

  return messages.join(' ').toLowerCase();
}

function isAtlasIpNotAllowedError(error: unknown): boolean {
  const normalizedMessage = normalizeErrorMessage(error);

  return ATLAS_IP_NOT_ALLOWED_HINTS.some((hint) =>
    normalizedMessage.includes(hint),
  );
}

/**
 * Conecta ao MongoDB.
 *
 * Motivo:
 * centralizar a conexão em um único ponto da infraestrutura
 * e facilitar manutenção futura.
 */
export async function connectDatabase(mongoUri: string): Promise<void> {
  if (!mongoUri || mongoUri.trim().length === 0) {
    throw new Error('MONGO_URI não foi informada.');
  }

  try {
    await mongoose.connect(mongoUri);
  } catch (error: unknown) {
    if (isAtlasIpNotAllowedError(error)) {
      const atlasIpNotAllowedError = new Error(
        'Não foi possível conectar ao MongoDB Atlas porque o IP desta máquina não está liberado. Libere o IP em Atlas > Network Access e tente novamente.',
      );
      (
        atlasIpNotAllowedError as Error & {
          cause?: unknown;
        }
      ).cause = error;
      throw atlasIpNotAllowedError;
    }

    throw error;
  }

  console.log('✅ Conectado ao MongoDB com sucesso.');
}

/**
 * Fecha a conexão com o MongoDB.
 *
 * Útil para testes e shutdown controlado.
 */
export async function disconnectDatabase(): Promise<void> {
  await mongoose.disconnect();
}
