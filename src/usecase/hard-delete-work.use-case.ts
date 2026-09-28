import { HttpError } from '../core/domain/application/ApplicationError/http-error';
import type { ImageStoragePort } from '../core/domain/application/Storage/image-storage.port';
import type { WorkRepositoryPort } from '../core/domain/repositories/work.repository';

/**
 * Remove definitivamente um Work, incluindo suas imagens no
 * storage externo e seus comentários (FR-006).
 *
 * Ordem de remoção: as imagens são removidas do storage externo
 * (Cloudinary) sequencialmente antes de o Work ser removido do
 * MongoDB. O adapter ativo de `ImageStoragePort` trata "not found"
 * como sucesso (exclusão idempotente); qualquer outra falha real
 * aborta a operação com `HttpError(502, ...)`.
 *
 * Comportamento em falha parcial: se a remoção de uma imagem N
 * falhar após as imagens `1..N-1` já terem sido removidas com
 * sucesso do storage externo, os metadados dessas imagens também são
 * removidos imediatamente do Work. Assim, leituras públicas não
 * continuam expondo URLs quebradas, e uma nova tentativa processa
 * apenas as imagens restantes. Não há compensação/rollback automático
 * das exclusões já realizadas.
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

    let removedImagesCount = 0;

    for (const image of work.images) {
      try {
        await this.imageStorage.delete(image.publicId);
        await this.workRepository.removeImage(workId, image.id);
        removedImagesCount += 1;
      } catch (error: unknown) {
        console.error(
          'Falha ao remover imagem do armazenamento externo durante hard delete.',
          error,
        );

        if (removedImagesCount > 0) {
          throw new HttpError(
            502,
            'Falha parcial ao remover arquivos do armazenamento externo. Algumas imagens já foram removidas. Tente novamente para concluir a operação.',
            {
              code: 'PARTIAL_IMAGE_DELETION',
              retryable: true,
              removedImagesCount,
              remainingImagesCount: work.images.length - removedImagesCount,
            },
          );
        }

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
