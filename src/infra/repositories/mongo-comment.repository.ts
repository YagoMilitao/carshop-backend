import { randomUUID } from 'crypto';
import type {
  CommentRepositoryPort,
  CreateCommentRepositoryInput,
  UpdateCommentRepositoryInput,
} from '../../core/domain/repositories/comment.repository';
import type { Comment } from '../../core/domain/application/Work/work.types';
import { CommentModel } from '../../data/models/comment.model';

/**
 * Repository Mongo para comentários.
 *
 * Motivo:
 * concentrar persistência e leitura dos comentários no banco.
 */
function toComment(document: {
  id: string;
  workId: string;
  authorName: string;
  content: string;
  status: 'PENDING' | 'APPROVED';
  createdAt: Date;
  updatedAt: Date;
}): Comment {
  return {
    id: document.id,
    workId: document.workId,
    authorName: document.authorName,
    content: document.content,
    status: document.status,
    createdAt: document.createdAt.toISOString(),
    updatedAt: document.updatedAt.toISOString(),
  };
}
export class MongoCommentRepository implements CommentRepositoryPort {
  /**
   * Cria comentário sempre como PENDING.
   *
   * Motivo:
   * comentário público precisa passar por moderação.
   */
  async createPending(input: CreateCommentRepositoryInput): Promise<Comment> {
    const created = await CommentModel.create({
      id: randomUUID(),
      workId: input.workId,
      authorName: input.authorName,
      content: input.content,
      status: 'PENDING',
    });

    return toComment(created);
  }

  /**
   * Lista apenas comentários aprovados de um trabalho.
   */
  async listApprovedByWorkId(workId: string): Promise<Comment[]> {
    const comments = await CommentModel.find({
      workId,
      status: 'APPROVED',
    })
      .sort({ createdAt: -1 })
      .lean();

    return comments.map(toComment);
  }

  /**
   * Busca comentário pelo id.
   */
  async findById(id: string): Promise<Comment | undefined> {
    const comment = await CommentModel.findOne({ id }).lean();
    return comment ? toComment(comment) : undefined;
  }

  /**
   * Atualiza comentário parcialmente.
   */
  async update(
    id: string,
    input: UpdateCommentRepositoryInput,
  ): Promise<Comment | undefined> {
    const updated = await CommentModel.findOneAndUpdate({ id }, input, {
      new: true,
    }).lean();

    return updated ? toComment(updated) : undefined;
  }

  /**
   * Remove comentário definitivamente.
   */
  async deleteById(id: string): Promise<void> {
    await CommentModel.deleteOne({ id });
  }
}
