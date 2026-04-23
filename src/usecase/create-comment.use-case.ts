import { HttpError } from '../core/domain/application/ApplicationError/http-error';
import type { Comment } from '../core/domain/application/Work/work.types';
import type { CommentRepositoryPort } from '../core/domain/repositories/comment.repository';
import type { WorkRepositoryPort } from '../core/domain/repositories/work.repository';

interface CreateCommentUseCaseInput {
  workId: string;
  authorName: string;
  content: string;
}

/**
 * Caso de uso para criação de comentário.
 *
 * Regras:
 * - o work precisa existir
 * - comentário nasce como PENDING
 */
export class CreateCommentUseCase {
  constructor(
    private readonly commentRepository: CommentRepositoryPort,
    private readonly workRepository: WorkRepositoryPort,
  ) {}

  async execute(input: CreateCommentUseCaseInput): Promise<Comment> {
    const workExists = await this.workRepository.findById(input.workId);

    if (!workExists) {
      throw new HttpError(404, 'Trabalho não encontrado.');
    }

    return this.commentRepository.createPending({
      workId: input.workId,
      authorName: input.authorName.trim(),
      content: input.content.trim(),
    });
  }
}
