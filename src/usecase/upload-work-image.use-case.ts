import { randomUUID } from 'crypto';
import { HttpError } from '../core/domain/application/ApplicationError/http-error';
import type { ImageStoragePort } from '../core/domain/application/Storage/image-storage.port';
import type { WorkRepositoryPort } from '../core/domain/repositories/work.repository';

interface UploadWorkImageInput {
  workId: string;
  filePath: string;
  alt: string;
  isCover: boolean;
}

/**
 * Caso de uso para adicionar imagem em um Work.
 *
 * Motivo:
 * centralizar regra de negócio:
 * - verificar se o Work existe
 * - enviar imagem para storage
 * - salvar metadados no Mongo
 */
export class UploadWorkImageUseCase {
  constructor(
    private readonly workRepository: WorkRepositoryPort,
    private readonly imageStorage: ImageStoragePort,
  ) {}

  async execute(input: UploadWorkImageInput): Promise<void> {
    const work = await this.workRepository.findById(input.workId);

    if (!work) {
      throw new HttpError(404, 'Trabalho não encontrado.');
    }

    const uploadedImage = await this.imageStorage.upload(input.filePath);

    await this.workRepository.addImage(input.workId, {
      id: randomUUID(),
      url: uploadedImage.url,
      publicId: uploadedImage.publicId,
      alt: input.alt,
      isCover: input.isCover,
      order: work.images.length,
      createdAt: '',
      updatedAt: '',
    });
  }
}
