import { Schema, model, type InferSchemaType } from 'mongoose';

/**
 * Model do usuário administrador.
 *
 * Motivo:
 * no futuro você pode sair do admin via .env
 * e autenticar por banco sem reestruturar tudo.
 */
const adminUserSchema = new Schema(
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
      unique: true,
      index: true,
      trim: true,
      lowercase: true,
    },
    passwordHash: {
      type: String,
      required: true,
    },
    isActive: {
      type: Boolean,
      required: true,
      default: true,
    },
  },
  {
    timestamps: true,
    versionKey: false,
    collection: 'admin_users',
  },
);

export type AdminUserDocument = InferSchemaType<typeof adminUserSchema>;

export const AdminUserModel = model('AdminUser', adminUserSchema);
