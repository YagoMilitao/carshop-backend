import mongoose from 'mongoose';
import type { DatabaseHealthCheckPort } from '../../core/domain/application/Health/database-health-check.port';

/**
 * Implementação concreta de `DatabaseHealthCheckPort` baseada no estado
 * atual da conexão global do Mongoose.
 *
 * Motivo:
 * reutilizar a conexão já estabelecida por `connectDatabase`
 * (`src/infra/database/mongoose.ts`), sem abrir uma nova conexão ou
 * realizar uma consulta ativa ao banco.
 */
export class MongooseDatabaseHealthCheckService implements DatabaseHealthCheckPort {
  isConnected(): boolean {
    return Number(mongoose.connection.readyState) === 1;
  }
}
