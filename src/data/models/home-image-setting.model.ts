import { Schema, model, type InferSchemaType } from 'mongoose';

/**
 * Chave fixa do documento singleton da configuração da Home.
 */
export const HOME_IMAGE_SETTING_KEY = 'home';

/**
 * Configuração persistida da imagem principal da Home (CARSHOP-159).
 *
 * Motivo:
 * o campo `key`, com enum de valor único e índice único, garante no banco
 * que exista no máximo um documento de configuração (FR-001). Apenas a
 * referência (`workId` + `imageId`) é persistida; URL e texto alternativo
 * são resolvidos a partir do Work na leitura (AD-001/AD-002).
 */
const homeImageSettingSchema = new Schema(
  {
    key: {
      type: String,
      required: true,
      unique: true,
      enum: [HOME_IMAGE_SETTING_KEY],
      default: HOME_IMAGE_SETTING_KEY,
    },

    workId: {
      type: String,
      required: true,
      trim: true,
    },

    imageId: {
      type: String,
      required: true,
      trim: true,
    },
  },
  {
    timestamps: true,
    versionKey: false,
    collection: 'home_image_settings',
  },
);

export type HomeImageSettingDocument = InferSchemaType<
  typeof homeImageSettingSchema
>;

export const HomeImageSettingModel = model(
  'HomeImageSetting',
  homeImageSettingSchema,
);
