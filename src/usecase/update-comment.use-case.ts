import { HttpError } from '../core/domain/application/ApplicationError/http-error';
import type { Comment } from '../core/domain/application/Work/work.types';
import type {
  CommentRepositoryPort,
  UpdateCommentRepositoryInput,
} from '../core/domain/repositories/comment.repository';

/**
 * Edita comentário via admin.
 *
 * Motivo:
 * permitir correção/moderação do conteúdo quando necessário.
 */
export class UpdateCommentUseCase {
  constructor(private readonly commentRepository: CommentRepositoryPort) {}

  async execute(
    commentId: string,
    input: UpdateCommentRepositoryInput,
  ): Promise<Comment> {
    const comment = await this.commentRepository.findById(commentId);

    if (!comment) {
      throw new HttpError(404, 'Comentário não encontrado.');
    }

    const updated = await this.commentRepository.update(commentId, input);

    if (!updated) {
      throw new HttpError(500, 'Não foi possível atualizar o comentário.');
    }

    return updated;
  }
}
