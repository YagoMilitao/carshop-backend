import { Schema, model, type InferSchemaType } from 'mongoose';

/**
 * Schema Mongo da sessão autenticada.
 *
 * Motivo:
 * persistir sessões de refresh de forma durável,
 * permitindo restart do servidor e deploy real sem perder sessão.
 */
const authSessionSchema = new Schema(
  {
    id: {
      type: String,
      required: true,
      unique: true,
      index: true,
      trim: true,
    },
    email: {
      type: String,
      required: true,
      index: true,
      trim: true,
      lowercase: true,
    },
    csrfToken: {
      type: String,
      required: true,
    },
    refreshTokenHash: {
      type: String,
      required: true,
    },
    /**
     * Timestamp em milissegundos.
     *
     * Motivo:
     * manter compatibilidade com a modelagem atual da sua aplicação.
     */
    expiresAt: {
      type: Number,
      required: true,
      index: true,
    },
    revokedAt: {
      type: Number,
      required: false,
      default: undefined,
      index: true,
    },
  },
  {
    timestamps: true,
    versionKey: false,
    collection: 'auth_sessions',
  },
);

export type AuthSessionDocument = InferSchemaType<typeof authSessionSchema>;

export const AuthSessionModel = model('AuthSession', authSessionSchema);
