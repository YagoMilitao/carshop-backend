import { HttpError } from '../core/domain/application/ApplicationError/http-error';
import {
  type HomeImage,
  isWorkEligibleForHomeImage,
} from '../core/domain/application/HomeImage/home-image.types';
import type { HomeImageSettingsRepositoryPort } from '../core/domain/repositories/home-image-settings.repository';
import type { WorkRepositoryPort } from '../core/domain/repositories/work.repository';

export interface SetHomeImageInput {
  workId: string;
  imageId: string;
}

/**
 * Seleciona a imagem principal da Home (CARSHOP-159).
 *
 * Motivo:
 * validar que a imagem existe e é elegível antes de persistir (FR-006,
 * AD-003). Quando a validação falha, nada é gravado e a configuração
 * anterior permanece inalterada.
 */
export class SetHomeImageUseCase {
  constructor(
    private readonly workRepository: WorkRepositoryPort,
    private readonly homeImageSettingsRepository: HomeImageSettingsRepositoryPort,
  ) {}

  async execute(input: SetHomeImageInput): Promise<HomeImage> {
    const work = await this.workRepository.findById(input.workId);

    if (!work) {
      throw new HttpError(404, 'Trabalho não encontrado.');
    }

    const image = work.images.find(
      (workImage) => workImage.id === input.imageId,
    );

    if (!image) {
      throw new HttpError(404, 'Imagem não encontrada.');
    }

    if (!isWorkEligibleForHomeImage(work)) {
      throw new HttpError(
        409,
        'A imagem selecionada não é elegível: o trabalho não está publicado.',
      );
    }

    await this.homeImageSettingsRepository.save({
      workId: work.id,
      imageId: image.id,
    });

    return {
      workId: work.id,
      imageId: image.id,
      url: image.url,
      alt: image.alt,
    };
  }
}
