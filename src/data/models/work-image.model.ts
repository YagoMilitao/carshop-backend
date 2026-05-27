import { Schema, model, type InferSchemaType } from 'mongoose';

/**
 * Schema das imagens do trabalho.
 *
 * Motivo:
 * manter imagens separadas facilita paginação,
 * remoção individual e delete em cascata manual.
 */
const workImageSchema = new Schema(
  {
    id: {
      type: String,
      required: true,
      unique: true,
      index: true,
      trim: true,
    },
    workId: {
      type: String,
      required: true,
      index: true,
      trim: true,
    },
    url: {
      type: String,
      required: true,
      trim: true,
    },
    alt: {
      type: String,
      required: true,
      trim: true,
    },
    isCover: {
      type: Boolean,
      required: true,
      default: false,
    },
  },
  {
    timestamps: true,
    versionKey: false,
    collection: 'work_images',
  },
);

export type WorkImageDocument = InferSchemaType<typeof workImageSchema>;

export const WorkImageModel = model('WorkImage', workImageSchema);
