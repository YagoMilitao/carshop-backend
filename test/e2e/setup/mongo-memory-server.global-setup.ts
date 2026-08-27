import { MongoMemoryServer } from 'mongodb-memory-server';
import { setMongoMemoryServer } from './mongo-memory-server.context';

const MONGODB_BINARY_VERSION = '8.0.29';

/**
 * Jest `globalSetup`: roda uma única vez, no processo principal do Jest,
 * antes de qualquer arquivo de teste ser exigido.
 *
 * Motivo:
 * `src/infra/config/env.ts` valida `MONGO_URI` em tempo de carregamento do
 * módulo, e `app.e2e-spec.ts` importa `createApp` no topo do arquivo. Por
 * isso, `process.env.MONGO_URI` precisa existir antes do Jest exigir o
 * grafo de módulos do arquivo de teste — o que só o `globalSetup` garante.
 */
export default async function globalSetup(): Promise<void> {
  const server = await MongoMemoryServer.create({
    // Keep CI independent from mongodb-memory-server's mutable default. This
    // version has published binaries for Ubuntu 24.04 (x64 and arm64).
    binary: { version: MONGODB_BINARY_VERSION },
  });

  process.env.MONGO_URI = server.getUri();

  setMongoMemoryServer(server);
}
