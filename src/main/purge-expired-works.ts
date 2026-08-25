import { env } from '../infra/config/env';
import {
  connectDatabase,
  disconnectDatabase,
} from '../infra/database/mongoose';
import { MongoWorkRepository } from '../infra/repositories/mongo-work.repository';
import { CloudinaryStorageService } from '../infra/gateway/cloudinary/cloudinary-storage.service';
import { HardDeleteWorkUseCase } from '../usecase/hard-delete-work.use-case';
import { PurgeExpiredWorksUseCase } from '../usecase/purge-expired-works.use-case';

/**
 * Script standalone para expurgo definitivo de works removidos
 * logicamente há mais tempo que `WORK_HARD_DELETE_AFTER_DAYS` (FR-010).
 *
 * Pode ser invocado sob demanda ou por um mecanismo externo de
 * agendamento, sem depender de um ciclo de requisição/resposta HTTP.
 */
async function run(): Promise<void> {
  try {
    await connectDatabase(env.mongoUri);

    const workRepository = new MongoWorkRepository();
    const imageStorage = new CloudinaryStorageService();
    const hardDeleteWorkUseCase = new HardDeleteWorkUseCase(
      workRepository,
      imageStorage,
    );
    const purgeExpiredWorksUseCase = new PurgeExpiredWorksUseCase(
      workRepository,
      hardDeleteWorkUseCase,
    );

    const result = await purgeExpiredWorksUseCase.execute(
      env.workHardDeleteAfterDays,
    );

    console.log(
      `Rotina de expurgo concluída. Works removidos definitivamente: ${result.removedWorksCount}.`,
    );
  } catch (error: unknown) {
    console.error(
      'Erro ao executar a rotina de expurgo de works.',
      error instanceof Error ? error.message : 'erro desconhecido',
    );
    process.exitCode = 1;
  } finally {
    await disconnectDatabase();
  }
}

void run();
