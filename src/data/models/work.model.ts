import { Schema, model, type InferSchemaType } from 'mongoose';

/**
 * Metadados extras do trabalho.
 * Motivo: guardar dados úteis sem poluir o schema principal.
 */
const workMetadataSchema = new Schema(
  {
    vehicleBrand: { type: String, trim: true },
    vehicleModel: { type: String, trim: true },
    serviceType: { type: String, trim: true },
  },
  { _id: false },
);

/**
 * Campos de SEO para o Next.js depois.
 */
const workSeoSchema = new Schema(
  {
    metaTitle: { type: String, trim: true, maxlength: 120 },
    metaDescription: { type: String, trim: true, maxlength: 255 },
    keywords: { type: [String], default: [] },
  },
  { _id: false },
);

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

    metadata: {
      type: workMetadataSchema,
      required: true,
      default: {},
    },

    seo: {
      type: workSeoSchema,
      required: true,
      default: {},
    },

    status: {
      type: String,
      required: true,
      enum: ['draft', 'published'],
      default: 'draft',
      index: true,
    },

    publishedAt: {
      type: Date,
      default: null,
    },

    /**
     * Soft delete.
     * Se estiver null, o trabalho está ativo.
     * Se tiver data, foi removido logicamente.
     */
    deletedAt: {
      type: Date,
      default: null,
      index: true,
    },
  },
  {
    timestamps: true,
    versionKey: false,
    collection: 'works',
  },
);

workSchema.pre('save', function normalizeFields() {
  if (Array.isArray(this.tags)) {
    this.tags = this.tags
      .map((tag: string) => tag.trim().toLowerCase())
      .filter(Boolean);
  }

  if (Array.isArray(this.seo?.keywords)) {
    this.seo.keywords = this.seo.keywords
      .map((keyword: string) => keyword.trim().toLowerCase())
      .filter(Boolean);
  }
});

export type WorkDocument = InferSchemaType<typeof workSchema>;

export const WorkModel = model('Work', workSchema);
