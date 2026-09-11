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
 * aborta a operação com `HttpError(502, ...)` antes de tocar no
 * Mongo.
 *
 * Comportamento em falha parcial: se a remoção de uma imagem N
 * falhar após as imagens `1..N-1` já terem sido removidas com
 * sucesso do storage externo, o Work permanece no MongoDB
 * referenciando imagens já removidas do storage externo até uma
 * nova tentativa bem-sucedida — não há compensação/rollback
 * automático das exclusões já realizadas. O cliente deve repetir a
 * mesma chamada DELETE; como o adapter trata "not found" como
 * sucesso, a nova tentativa reprocessa as imagens já removidas sem
 * erro e conclui a exclusão restante, tornando o retry seguro e
 * idempotente.
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
