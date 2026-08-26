import { getMongoMemoryServer } from './mongo-memory-server.context';

/**
 * Jest `globalTeardown`: roda uma única vez, no processo principal do Jest,
 * depois que todos os arquivos de teste/workers finalizarem.
 */
export default async function globalTeardown(): Promise<void> {
  const server = getMongoMemoryServer();

  if (server) {
    await server.stop();
  }
}
