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

    return {
      id: created.id,
      workId: created.workId,
      authorName: created.authorName,
      content: created.content,
      status: created.status,
      createdAt: created.createdAt.toISOString(),
      updatedAt: created.updatedAt.toISOString(),
    };
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

    return comments.map((comment) => ({
      id: comment.id,
      workId: comment.workId,
      authorName: comment.authorName,
      content: comment.content,
      status: comment.status,
      createdAt: comment.createdAt.toISOString(),
      updatedAt: comment.updatedAt.toISOString(),
    }));
  }

  /**
   * Busca comentário pelo id.
   */
  async findById(id: string): Promise<Comment | undefined> {
    const comment = await CommentModel.findOne({ id }).lean();

    if (!comment) {
      return undefined;
    }

    return {
      id: comment.id,
      workId: comment.workId,
      authorName: comment.authorName,
      content: comment.content,
      status: comment.status,
      createdAt: comment.createdAt.toISOString(),
      updatedAt: comment.updatedAt.toISOString(),
    };
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

    if (!updated) {
      return undefined;
    }

    return {
      id: updated.id,
      workId: updated.workId,
      authorName: updated.authorName,
      content: updated.content,
      status: updated.status,
      createdAt: updated.createdAt.toISOString(),
      updatedAt: updated.updatedAt.toISOString(),
    };
  }

  /**
   * Remove comentário definitivamente.
   */
  async deleteById(id: string): Promise<void> {
    await CommentModel.deleteOne({ id });
  }
}
