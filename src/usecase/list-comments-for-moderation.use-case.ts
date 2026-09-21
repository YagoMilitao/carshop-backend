import type {
  CommentRepositoryPort,
  ListCommentsForModerationInput,
  PaginatedComments,
} from '../core/domain/repositories/comment.repository';

/**
 * Lista comentários para a tela de moderação administrativa.
 *
 * Motivo:
 * repassa o filtro/paginação já validados para o repositório, sem regra
 * de negócio adicional — o endpoint não é escopado a um `work`.
 */
export class ListCommentsForModerationUseCase {
  constructor(private readonly commentRepository: CommentRepositoryPort) {}

  async execute(
    input: ListCommentsForModerationInput,
  ): Promise<PaginatedComments> {
    return this.commentRepository.listForModeration(input);
  }
}
