import { HttpError } from '../core/domain/application/ApplicationError/http-error';
import type { Comment } from '../core/domain/application/Work/work.types';
import type { CommentRepositoryPort } from '../core/domain/repositories/comment.repository';
import type { WorkRepositoryPort } from '../core/domain/repositories/work.repository';

/**
 * Lista comentários aprovados de um trabalho.
 */
export class ListApprovedCommentsUseCase {
  constructor(
    private readonly commentRepository: CommentRepositoryPort,
    private readonly workRepository: WorkRepositoryPort,
  ) {}

  async execute(workId: string): Promise<Comment[]> {
    const workExists = await this.workRepository.findById(workId);

    if (!workExists) {
      throw new HttpError(404, 'Trabalho não encontrado.');
    }

    return this.commentRepository.listApprovedByWorkId(workId);
  }
}
