import type { MongoMemoryServer } from 'mongodb-memory-server';

/**
 * Chave dedicada usada para armazenar a instância do `MongoMemoryServer`
 * em `globalThis`.
 *
 * Motivo:
 * `globalSetup` e `globalTeardown` do Jest rodam em arquivos separados,
 * executados no processo principal do Jest, e não compartilham módulos
 * entre si. `globalThis` é o único estado compartilhado disponível entre
 * eles nesse processo.
 */
const MONGO_MEMORY_SERVER_GLOBAL_KEY = '__CARSHOP_E2E_MONGO_MEMORY_SERVER__';

interface MongoMemoryServerGlobalContext {
  [MONGO_MEMORY_SERVER_GLOBAL_KEY]?: MongoMemoryServer;
}

function getGlobalContext(): MongoMemoryServerGlobalContext {
  return globalThis as unknown as MongoMemoryServerGlobalContext;
}

export function setMongoMemoryServer(server: MongoMemoryServer): void {
  getGlobalContext()[MONGO_MEMORY_SERVER_GLOBAL_KEY] = server;
}

export function getMongoMemoryServer(): MongoMemoryServer | undefined {
  return getGlobalContext()[MONGO_MEMORY_SERVER_GLOBAL_KEY];
}
