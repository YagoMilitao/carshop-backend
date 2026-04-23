import { HttpError } from '../core/domain/application/ApplicationError/http-error';
import type { Comment } from '../core/domain/application/Work/work.types';
import type { CommentRepositoryPort } from '../core/domain/repositories/comment.repository';

/**
 * Aprova um comentário pendente.
 *
 * Motivo:
 * só comentário aprovado deve aparecer na área pública.
 */
export class ApproveCommentUseCase {
  constructor(private readonly commentRepository: CommentRepositoryPort) {}

  async execute(commentId: string): Promise<Comment> {
    const comment = await this.commentRepository.findById(commentId);

    if (!comment) {
      throw new HttpError(404, 'Comentário não encontrado.');
    }

    const updated = await this.commentRepository.update(commentId, {
      status: 'APPROVED',
    });

    if (!updated) {
      throw new HttpError(500, 'Não foi possível aprovar o comentário.');
    }

    return updated;
  }
}
