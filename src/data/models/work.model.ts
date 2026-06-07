import { Schema, model, type InferSchemaType } from 'mongoose';

/**
 * Imagem vinculada ao trabalho.
 *
 * Motivo:
 * o Mongo salva só metadados da imagem.
 * O arquivo real fica no Cloudinary/S3.
 */
const workImageSchema = new Schema(
  {
    id: {
      type: String,
      required: true,
      trim: true,
    },

    url: {
      type: String,
      required: true,
      trim: true,
    },

    publicId: {
      type: String,
      required: true,
      trim: true,
    },

    alt: {
      type: String,
      required: true,
      trim: true,
      maxlength: 160,
    },

    isCover: {
      type: Boolean,
      required: true,
      default: false,
    },

    order: {
      type: Number,
      required: true,
      default: 0,
      min: 0,
    },
  },
  { _id: false },
);

/**
 * Metadados extras do trabalho.
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
 * Campos de SEO para uso futuro no Next.js.
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

    /**
     * Galeria de imagens do trabalho.
     *
     * Regra:
     * no máximo uma imagem pode ser capa.
     */
    images: {
      type: [workImageSchema],
      required: true,
      default: [],
      validate: {
        validator(images: Array<{ isCover: boolean }>): boolean {
          const coverCount = images.filter((image) => image.isCover).length;
          return coverCount <= 1;
        },
        message: 'O trabalho pode ter no máximo uma imagem de capa.',
      },
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
     *
     * null = ativo
     * Date = removido logicamente
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

/**
 * Normaliza campos antes de salvar.
 *
 * Motivo:
 * evita duplicidade visual como "Couro", " couro " e "COURO".
 */
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

  this.images = this.images.sort(
    (firstImage, secondImage) => firstImage.order - secondImage.order,
  );
});

export type WorkDocument = InferSchemaType<typeof workSchema>;

export const WorkModel = model('Work', workSchema);
