import mongoose from 'mongoose';

const ATLAS_IP_NOT_ALLOWED_HINTS = [
  "ip that isn't whitelisted",
  'not whitelisted',
  'network access list',
  'not allowed to access this mongodb atlas cluster',
  'add your current ip address',
];

/**
 * Indica se `current` já foi visitado e deve ser ignorado.
 *
 * Motivo:
 * evitar loop infinito quando a cadeia de `cause`/`reason` de um erro
 * contém uma referência cíclica.
 */
function shouldSkipVisited(current: unknown, visited: Set<unknown>): boolean {
  if (typeof current === 'object' || typeof current === 'function') {
    return visited.has(current);
  }

  return false;
}

/**
 * Extrai a mensagem textual de `current`, quando houver.
 */
function extractMessage(current: unknown): string | undefined {
  if (current instanceof Error) {
    return current.message;
  }

  if (typeof current === 'object' && current !== null) {
    const candidate = current as Record<string, unknown>;

    if (typeof candidate.message === 'string') {
      return candidate.message;
    }
  }

  return undefined;
}

/**
 * Extrai os próximos candidatos a percorrer (cause antes de reason).
 */
function extractNextCandidates(current: unknown): unknown[] {
  if (current instanceof Error) {
    const maybeCause = (current as Error & { cause?: unknown }).cause;
    return maybeCause ? [maybeCause] : [];
  }

  if (typeof current === 'object' && current !== null) {
    const candidate = current as Record<string, unknown>;
    const candidates: unknown[] = [];

    if ('cause' in candidate) {
      candidates.push(candidate.cause);
    }

    if ('reason' in candidate) {
      candidates.push(candidate.reason);
    }

    return candidates;
  }

  return [];
}

function normalizeErrorMessage(error: unknown): string {
  const messages: string[] = [];
  const queue: unknown[] = [error];
  const visited = new Set<unknown>();

  while (queue.length > 0) {
    const current = queue.shift();

    if (!current) {
      continue;
    }

    if (shouldSkipVisited(current, visited)) {
      continue;
    }

    if (typeof current === 'object' || typeof current === 'function') {
      visited.add(current);
    }

    if (typeof current === 'string') {
      messages.push(current);
      continue;
    }

    const message = extractMessage(current);
    if (message !== undefined) {
      messages.push(message);
    }

    queue.push(...extractNextCandidates(current));
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

    const genericConnectionError = new Error(
      'Não foi possível conectar ao MongoDB. Verifique a configuração de MONGO_URI e a conectividade com o servidor.',
    );
    (genericConnectionError as Error & { cause?: unknown }).cause = error;
    throw genericConnectionError;
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
