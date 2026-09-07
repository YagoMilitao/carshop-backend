import { randomUUID } from 'node:crypto';
import { env } from '../infra/config/env';
import {
  connectDatabase,
  disconnectDatabase,
} from '../infra/database/mongoose';
import { HealthCheckPingModel } from '../data/models/health-check-ping.model';

/**
 * Script standalone que exercita um ciclo controlado de
 * escrita -> leitura -> remoção contra o banco configurado, confirmando
 * que a conexão e as permissões estão funcionais de ponta a ponta, sem
 * deixar dados residuais (FR-006/AC-005).
 *
 * A criação e a leitura ficam dentro de um `try/finally` interno que remove
 * pelo marker predefinido, inclusive quando a confirmação da escrita se perde.
 */
async function run(): Promise<void> {
  try {
    await connectDatabase(env.mongoUri);

    const marker = `health-check-${Date.now()}-${randomUUID()}`;

    try {
      const createdPing = await HealthCheckPingModel.create({ marker });

      const readBackPing = await HealthCheckPingModel.findById(
        createdPing._id,
      ).lean();

      if (readBackPing?.marker !== marker) {
        throw new Error(
          'O documento lido não corresponde ao documento escrito.',
        );
      }
    } finally {
      await HealthCheckPingModel.deleteOne({ marker });
    }

    console.log(
      'Verificação de leitura/escrita concluída com sucesso, sem dados residuais.',
    );
  } catch {
    console.error('Erro ao executar a verificação de leitura/escrita.');
    process.exitCode = 1;
  } finally {
    await disconnectDatabase();
  }
}

void run();
