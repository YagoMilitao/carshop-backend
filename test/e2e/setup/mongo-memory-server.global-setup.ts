import { MongoMemoryServer } from 'mongodb-memory-server';
import { setMongoMemoryServer } from './mongo-memory-server.context';

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
  const server = await MongoMemoryServer.create();

  process.env.MONGO_URI = server.getUri();

  setMongoMemoryServer(server);
}
