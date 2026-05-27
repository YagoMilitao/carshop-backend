import { Schema, model, type InferSchemaType } from 'mongoose';

/**
 * Schema do trabalho do portfólio.
 */
const workSchema = new Schema(
  {
    id: {
      type: String,
      required: true,
      unique: true,
      index: true,
      trim: true,
    },
    slug: {
      type: String,
      required: true,
      unique: true,
      index: true,
      trim: true,
      lowercase: true,
    },
    title: {
      type: String,
      required: true,
      trim: true,
      maxlength: 120,
    },
    description: {
      type: String,
      required: true,
      trim: true,
      maxlength: 5000,
    },
    category: {
      type: String,
      required: true,
      index: true,
      trim: true,
      lowercase: true,
    },
    tags: {
      type: [String],
      required: true,
      default: [],
      index: true,
    },
    status: {
      type: String,
      required: true,
      enum: ['draft', 'published'],
      default: 'draft',
      index: true,
    },
  },
  {
    timestamps: true,
    versionKey: false,
    collection: 'works',
  },
);

/**
 * Normaliza tags antes de salvar.
 */
workSchema.pre('save', function normalizeTags() {
  if (Array.isArray(this.tags)) {
    this.tags = this.tags.map((tag: string) => tag.trim().toLowerCase());
  }
});

export type WorkDocument = InferSchemaType<typeof workSchema>;

export const WorkModel = model('Work', workSchema);
