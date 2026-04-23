import { Schema, model, type InferSchemaType } from 'mongoose';

/**
 * Schema dos comentários.
 */
const commentSchema = new Schema(
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
    authorName: {
      type: String,
      required: true,
      trim: true,
      maxlength: 80,
    },
    content: {
      type: String,
      required: true,
      trim: true,
      maxlength: 1000,
    },
    status: {
      type: String,
      required: true,
      enum: ['PENDING', 'APPROVED'],
      default: 'PENDING',
      index: true,
    },
  },
  {
    timestamps: true,
    versionKey: false,
    collection: 'comments',
  },
);

export type CommentDocument = InferSchemaType<typeof commentSchema>;

export const CommentModel = model('Comment', commentSchema);
