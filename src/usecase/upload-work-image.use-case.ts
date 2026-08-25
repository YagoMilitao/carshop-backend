import { randomUUID } from 'crypto';
import { promises as fs } from 'fs';
import { HttpError } from '../core/domain/application/ApplicationError/http-error';
import type { ImageStoragePort } from '../core/domain/application/Storage/image-storage.port';
import type { WorkRepositoryPort } from '../core/domain/repositories/work.repository';

interface UploadWorkImageInput {
  workId: string;
  filePath: string;
  mimeType: string;
  originalName: string;
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
 * - garantir limpeza do arquivo temporário
 * - compensar upload feito no storage caso a persistência falhe
 */
export class UploadWorkImageUseCase {
  constructor(
    private readonly workRepository: WorkRepositoryPort,
    private readonly imageStorage: ImageStoragePort,
  ) {}

  async execute(input: UploadWorkImageInput): Promise<void> {
    try {
      const work = await this.workRepository.findById(input.workId);

      if (!work) {
        throw new HttpError(404, 'Trabalho não encontrado.');
      }

      const buffer = await fs.readFile(input.filePath);

      const uploadedImage = await this.imageStorage.upload({
        buffer,
        mimeType: input.mimeType,
        originalName: input.originalName,
        folder: `carshop/works/${input.workId}`,
      });

      try {
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
      } catch {
        /**
         * Compensação: o upload no storage externo foi concluído,
         * mas a persistência no Mongo falhou. Tentamos remover o
         * arquivo remoto para não deixar órfãos (NFR-002).
         *
         * Falhas nessa compensação são apenas registradas: nunca
         * devem mascarar o erro original.
         */
        try {
          await this.imageStorage.delete(uploadedImage.publicId);
        } catch (compensationError: unknown) {
          console.error(
            'Falha ao compensar upload após erro de persistência.',
            compensationError,
          );
        }

        throw new HttpError(
          500,
          'Falha ao salvar os metadados da imagem. Nenhuma alteração foi persistida.',
        );
      }
    } finally {
      /**
       * Sempre limpamos o arquivo temporário do Multer,
       * independentemente do resultado do upload/persistência.
       */
      try {
        await fs.unlink(input.filePath);
      } catch {
        // Melhor esforço: o arquivo já pode não existir.
      }
    }
  }
}
