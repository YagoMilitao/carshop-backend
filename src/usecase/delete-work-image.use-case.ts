import { HttpError } from '../core/domain/application/ApplicationError/http-error';
import type { ImageStoragePort } from '../core/domain/application/Storage/image-storage.port';
import type { WorkRepositoryPort } from '../core/domain/repositories/work.repository';

interface DeleteWorkImageInput {
  workId: string;
  imageId: string;
}

/**
 * Remove uma imagem de um Work.
 *
 * Motivo:
 * garantir que a exclusão remova tanto o arquivo no storage
 * externo quanto o metadado persistido no Mongo (FR-005).
 */
export class DeleteWorkImageUseCase {
  constructor(
    private readonly workRepository: WorkRepositoryPort,
    private readonly imageStorage: ImageStoragePort,
  ) {}

  async execute(input: DeleteWorkImageInput): Promise<{ success: true }> {
    const work = await this.workRepository.findById(input.workId);

    if (!work) {
      throw new HttpError(404, 'Trabalho não encontrado.');
    }

    const image = work.images.find((image) => image.id === input.imageId);

    if (!image) {
      throw new HttpError(404, 'Imagem não encontrada.');
    }

    await this.imageStorage.delete(image.publicId);
    await this.workRepository.removeImage(input.workId, input.imageId);

    return { success: true };
  }
}
