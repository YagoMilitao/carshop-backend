import { HttpError } from '../core/domain/application/ApplicationError/http-error';
import {
  type HomeImage,
  isWorkEligibleForHomeImage,
} from '../core/domain/application/HomeImage/home-image.types';
import type { Work } from '../core/domain/application/Work/work.types';
import type { HomeImageSettingsRepositoryPort } from '../core/domain/repositories/home-image-settings.repository';
import type { WorkRepositoryPort } from '../core/domain/repositories/work.repository';

/**
 * Lê a imagem principal da Home para a página pública (CARSHOP-159).
 *
 * Motivo:
 * a referência persistida é revalidada a cada leitura contra o estado
 * atual do Work (AD-002/AD-003). Se o Work foi removido (físico ou lógico),
 * despublicado, ou a imagem não existe mais, a resposta é a mesma de
 * "não configurado" (`null`, AD-004). A leitura nunca grava nada.
 */
export class GetHomeImageUseCase {
  constructor(
    private readonly workRepository: WorkRepositoryPort,
    private readonly homeImageSettingsRepository: HomeImageSettingsRepositoryPort,
  ) {}

  async execute(): Promise<HomeImage | null> {
    const selection = await this.homeImageSettingsRepository.find();

    if (!selection) {
      return null;
    }

    const work = await this.findWork(selection.workId);

    if (!work || !isWorkEligibleForHomeImage(work)) {
      return null;
    }

    const image = work.images.find(
      (workImage) => workImage.id === selection.imageId,
    );

    if (!image) {
      return null;
    }

    return {
      workId: work.id,
      imageId: image.id,
      url: image.url,
      alt: image.alt,
    };
  }

  /**
   * Busca o Work referenciado tratando um identificador persistido
   * inválido (rejeitado pelo repositório com 400) como referência
   * inexistente, para que a leitura pública nunca falhe por isso.
   */
  private async findWork(workId: string): Promise<Work | undefined> {
    try {
      return await this.workRepository.findById(workId);
    } catch (error: unknown) {
      if (error instanceof HttpError && error.statusCode === 400) {
        return undefined;
      }

      throw error;
    }
  }
}
