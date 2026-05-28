import { Schema, model, type InferSchemaType } from 'mongoose';

/**
 * Tag usada para classificar trabalhos.
 *
 * Exemplo:
 * - couro
 * - civic
 * - premium
 * - restauração
 */
const tagSchema = new Schema(
  {
    id: {
      type: String,
      required: true,
      unique: true,
      index: true,
      trim: true,
    },

    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 60,
    },

    slug: {
      type: String,
      required: true,
      unique: true,
      index: true,
      trim: true,
      lowercase: true,
    },

    deletedAt: {
      type: Date,
      required: false,
      default: null,
      index: true,
    },
  },
  {
    timestamps: true,
    versionKey: false,
    collection: 'tags',
  },
);

export type TagDocument = InferSchemaType<typeof tagSchema>;

export const TagModel = model('Tag', tagSchema);
