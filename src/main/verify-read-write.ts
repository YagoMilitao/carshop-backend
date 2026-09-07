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
 * A remoção do documento de verificação roda em um `finally` interno,
 * portanto acontece mesmo quando a asserção de leitura falha.
 */
async function run(): Promise<void> {
  try {
    await connectDatabase(env.mongoUri);

    const marker = `health-check-${Date.now()}-${Math.random()
      .toString(36)
      .slice(2)}`;

    const createdPing = await HealthCheckPingModel.create({ marker });

    try {
      const readBackPing = await HealthCheckPingModel.findById(
        createdPing._id,
      ).lean();

      if (!readBackPing || readBackPing.marker !== marker) {
        throw new Error(
          'O documento lido não corresponde ao documento escrito.',
        );
      }

      console.log(
        'Verificação de leitura/escrita concluída com sucesso, sem dados residuais.',
      );
    } finally {
      await HealthCheckPingModel.deleteOne({ _id: createdPing._id });
    }
  } catch (error: unknown) {
    console.error(
      'Erro ao executar a verificação de leitura/escrita.',
      error instanceof Error ? error.message : 'erro desconhecido',
    );
    process.exitCode = 1;
  } finally {
    await disconnectDatabase();
  }
}

void run();
