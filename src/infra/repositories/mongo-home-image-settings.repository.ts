import { HttpError } from '../../core/domain/application/ApplicationError/http-error';
import type { HomeImageSelection } from '../../core/domain/application/HomeImage/home-image.types';
import type {
  HomeImageSettingsRepositoryPort,
  SaveHomeImageSelectionInput,
} from '../../core/domain/repositories/home-image-settings.repository';
import {
  HOME_IMAGE_SETTING_KEY,
  HomeImageSettingModel,
} from '../../data/models/home-image-setting.model';

type HomeImageSettingPersistenceDocument = {
  workId: string;
  imageId: string;
  updatedAt: Date;
};

function toHomeImageSelection(
  document: HomeImageSettingPersistenceDocument,
): HomeImageSelection {
  return {
    workId: document.workId,
    imageId: document.imageId,
    updatedAt: document.updatedAt.toISOString(),
  };
}

function isDuplicateKeyError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === 11000
  );
}

/**
 * Repository Mongo da configuração singleton da imagem da Home.
 *
 * Responsabilidade:
 * ler e gravar o único documento de configuração (`key: 'home'`),
 * sem expor `_id` nem `key` para as camadas internas.
 */
export class MongoHomeImageSettingsRepository implements HomeImageSettingsRepositoryPort {
  async find(): Promise<HomeImageSelection | undefined> {
    const document = await HomeImageSettingModel.findOne({
      key: HOME_IMAGE_SETTING_KEY,
    }).lean();

    return document ? toHomeImageSelection(document) : undefined;
  }

  async save(input: SaveHomeImageSelectionInput): Promise<HomeImageSelection> {
    const workId = this.assertPlainIdentifier(input.workId, 'workId');
    const imageId = this.assertPlainIdentifier(input.imageId, 'imageId');

    try {
      return await this.upsert(workId, imageId);
    } catch (error: unknown) {
      /**
       * Duas primeiras gravações concorrentes podem tentar inserir o
       * documento singleton ao mesmo tempo; o índice único rejeita uma
       * delas. Uma nova tentativa encontra o documento já existente e o
       * atualiza.
       */
      if (isDuplicateKeyError(error)) {
        return this.upsert(workId, imageId);
      }

      throw error;
    }
  }

  private async upsert(
    workId: string,
    imageId: string,
  ): Promise<HomeImageSelection> {
    const document = await HomeImageSettingModel.findOneAndUpdate(
      { key: HOME_IMAGE_SETTING_KEY },
      { $set: { workId, imageId } },
      { upsert: true, new: true, runValidators: true },
    ).lean();

    if (!document) {
      throw new HttpError(500, 'Falha ao salvar a configuração da Home.');
    }

    return toHomeImageSelection(document);
  }

  /**
   * Garante que o identificador é uma string simples antes de alcançar o
   * Mongo, mesmo que a validação das camadas externas seja contornada.
   */
  private assertPlainIdentifier(value: unknown, fieldName: string): string {
    if (
      typeof value !== 'string' ||
      value.trim().length === 0 ||
      value.startsWith('$') ||
      value.includes('.')
    ) {
      throw new HttpError(400, `${fieldName} deve ser uma string válida.`);
    }

    return value;
  }
}
