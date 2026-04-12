import { Schema, model, type InferSchemaType } from 'mongoose';

/**
 * Subschema para imagens do trabalho.
 *
 * _id: false
 * evita criar ObjectId separado para cada imagem, o que simplifica o documento.
 */
const portfolioWorkImageSchema = new Schema(
  {
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
    _id: false,
  },
);

/**
 * Subschema para metadados do trabalho.
 *
 * _id: false
 * porque esses dados fazem parte do documento principal.
 */
const portfolioWorkMetadataSchema = new Schema(
  {
    clientName: {
      type: String,
      required: false,
      trim: true,
    },
    vehicleModel: {
      type: String,
      required: false,
      trim: true,
    },
    vehicleBrand: {
      type: String,
      required: false,
      trim: true,
    },
    serviceDate: {
      type: String,
      required: false,
      trim: true,
    },
    estimatedDurationInDays: {
      type: Number,
      required: false,
      min: 0,
    },
    seoTitle: {
      type: String,
      required: false,
      trim: true,
      maxlength: 120,
    },
    seoDescription: {
      type: String,
      required: false,
      trim: true,
      maxlength: 255,
    },
  },
  {
    _id: false,
  },
);

/**
 * Schema principal do trabalho do portfólio.
 *
 * Esse documento representa um serviço realizado
 * e exibido no site da tapeçaria automotiva.
 */
const portfolioWorkSchema = new Schema(
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
    images: {
      type: [portfolioWorkImageSchema],
      required: true,
      default: [],
      validate: {
        validator(images: Array<{ isCover: boolean }>): boolean {
          /**
           * Regra:
           * pode existir no máximo uma imagem de capa.
           *
           * Motivo:
           * evita inconsistência na UI do frontend.
           */
          const coverCount = images.filter((image) => image.isCover).length;
          return coverCount <= 1;
        },
        message: 'O trabalho pode ter no máximo uma imagem de capa.',
      },
    },
    metadata: {
      type: portfolioWorkMetadataSchema,
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
  },
  {
    timestamps: true,
    versionKey: false,
    collection: 'portfolio_works',
  },
);

/**
 * Normaliza tags antes de salvar.
 *
 * Motivo:
 * evitar duplicação visual como:
 * "Civic", "civic", " CIVIC "
 */
portfolioWorkSchema.pre('validate', function normalizeTags() {
  if (Array.isArray(this.tags)) {
    this.tags = this.tags.map((tag: string) => tag.trim().toLowerCase());
  }
});

export type PortfolioWorkDocument = InferSchemaType<typeof portfolioWorkSchema>;

export const PortfolioWorkModel = model('PortfolioWork', portfolioWorkSchema);
