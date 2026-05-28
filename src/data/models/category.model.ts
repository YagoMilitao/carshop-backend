import { Schema, model, type InferSchemaType } from 'mongoose';

/**
 * Categoria principal de um trabalho.
 *
 * Exemplo:
 * - bancos
 * - teto
 * - volante
 * - restauração
 */
const categorySchema = new Schema(
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
      maxlength: 80,
    },

    slug: {
      type: String,
      required: true,
      unique: true,
      index: true,
      trim: true,
      lowercase: true,
    },

    description: {
      type: String,
      required: false,
      trim: true,
      maxlength: 500,
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
    collection: 'categories',
  },
);

export type CategoryDocument = InferSchemaType<typeof categorySchema>;

export const CategoryModel = model('Category', categorySchema);
