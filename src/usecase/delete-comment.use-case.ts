import { HttpError } from '../core/domain/application/ApplicationError/http-error';
import type { CommentRepositoryPort } from '../core/domain/repositories/comment.repository';

/**
 * Remove comentário definitivamente.
 *
 * Motivo:
 * permitir que o admin exclua spam, abuso ou conteúdo inadequado.
 */
export class DeleteCommentUseCase {
  constructor(private readonly commentRepository: CommentRepositoryPort) {}

  async execute(commentId: string): Promise<{ success: true }> {
    const comment = await this.commentRepository.findById(commentId);

    if (!comment) {
      throw new HttpError(404, 'Comentário não encontrado.');
    }

    await this.commentRepository.deleteById(commentId);

    return { success: true };
  }
}
