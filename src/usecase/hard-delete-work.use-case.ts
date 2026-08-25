import { HttpError } from '../core/domain/application/ApplicationError/http-error';
import type { ImageStoragePort } from '../core/domain/application/Storage/image-storage.port';
import type { WorkRepositoryPort } from '../core/domain/repositories/work.repository';

/**
 * Remove definitivamente um Work, incluindo suas imagens no
 * storage externo e seus comentários (FR-006).
 *
 * Decisão arquitetural:
 * se qualquer exclusão no storage externo falhar de fato (não
 * "not found", que o adapter já trata como sucesso), abortamos
 * antes de tocar no Mongo, para não deixar registros órfãos sem
 * arquivo correspondente (NFR-002). A operação pode ser
 * reexecutada com segurança.
 */
export class HardDeleteWorkUseCase {
  constructor(
    private readonly workRepository: WorkRepositoryPort,
    private readonly imageStorage: ImageStoragePort,
  ) {}

  async execute(workId: string): Promise<{ success: true }> {
    const work = await this.workRepository.findByIdIncludingDeleted(workId);

    if (!work) {
      throw new HttpError(404, 'Trabalho não encontrado.');
    }

    for (const image of work.images) {
      try {
        await this.imageStorage.delete(image.publicId);
      } catch (error: unknown) {
        console.error(
          'Falha ao remover imagem do armazenamento externo durante hard delete.',
          error,
        );

        throw new HttpError(
          502,
          'Falha ao remover arquivos do armazenamento externo. Tente novamente.',
        );
      }
    }

    await this.workRepository.hardDelete(workId);

    return { success: true };
  }
}
