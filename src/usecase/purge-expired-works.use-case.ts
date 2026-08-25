import { HttpError } from '../core/domain/application/ApplicationError/http-error';
import type { WorkRepositoryPort } from '../core/domain/repositories/work.repository';
import type { HardDeleteWorkUseCase } from './hard-delete-work.use-case';

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * Expurga definitivamente works removidos logicamente há mais tempo
 * do que o período de retenção configurado (FR-001 a FR-010).
 *
 * Decisão arquitetural:
 * reutiliza `HardDeleteWorkUseCase` por composição, uma vez por
 * candidato, em vez de duplicar a lógica de cascade (comentários,
 * armazenamento externo de imagens) — mantém uma única fonte para a
 * operação destrutiva (NFR-001).
 *
 * Falhas por item não interrompem o lote: um `HttpError(404)` indica
 * que o work já foi removido por uma execução anterior/concorrente e é
 * ignorado silenciosamente (idempotência, NFR-002); qualquer outro
 * erro é registrado de forma segura e a rotina segue para o próximo
 * candidato (NFR-003).
 */
export class PurgeExpiredWorksUseCase {
  constructor(
    private readonly workRepository: WorkRepositoryPort,
    private readonly hardDeleteWorkUseCase: HardDeleteWorkUseCase,
  ) {}

  async execute(
    retentionDays: number,
    referenceDate: Date = new Date(),
  ): Promise<{ removedWorksCount: number }> {
    if (!Number.isInteger(retentionDays) || retentionDays <= 0) {
      throw new Error(
        'O período de retenção precisa ser um número inteiro positivo.',
      );
    }

    const cutoffDate = new Date(
      referenceDate.getTime() - retentionDays * MS_PER_DAY,
    );

    const candidates = await this.workRepository.listDeletedBefore(cutoffDate);

    let removedWorksCount = 0;

    for (const candidate of candidates) {
      try {
        await this.hardDeleteWorkUseCase.execute(candidate.id);
        removedWorksCount += 1;
      } catch (error: unknown) {
        if (error instanceof HttpError && error.statusCode === 404) {
          continue;
        }

        console.error(
          'Falha ao expurgar work durante a rotina de limpeza.',
          error instanceof Error ? error.message : 'erro desconhecido',
        );
      }
    }

    console.log(
      `Rotina de expurgo de works: ${candidates.length} candidato(s) encontrado(s), ${removedWorksCount} removido(s) definitivamente.`,
    );

    return { removedWorksCount };
  }
}
