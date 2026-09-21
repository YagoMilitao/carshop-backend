import type { Comment } from '../application/Work/work.types';

export interface CreateCommentRepositoryInput {
  workId: string;
  authorName: string;
  content: string;
}

export interface UpdateCommentRepositoryInput {
  authorName?: string;
  content?: string;
  status?: 'PENDING' | 'APPROVED';
}

/**
 * Valores de status aceitos como filtro na listagem administrativa de
 * moderação.
 *
 * Motivo:
 * `HIDDEN` não existe em `CommentStatus` (domínio) nem no schema Mongoose
 * de escrita — nenhum comentário pode assumir esse status através de um
 * caminho de escrita existente. Este tipo é intencionalmente mais amplo
 * apenas para fins de filtro de leitura (ver CARSHOP-136, Decisão A),
 * sem afetar `CommentStatus` nem `UpdateCommentRepositoryInput.status`.
 */
export type AdminCommentStatusFilter = 'PENDING' | 'APPROVED' | 'HIDDEN';

export interface ListCommentsForModerationInput {
  status?: AdminCommentStatusFilter;
  page: number;
  limit: number;
}

export interface PaginatedComments {
  items: Comment[];
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface CommentRepositoryPort {
  /**
   * Cria comentário sempre como pendente.
   */
  createPending(input: CreateCommentRepositoryInput): Promise<Comment>;

  /**
   * Lista apenas comentários aprovados de um work.
   */
  listApprovedByWorkId(workId: string): Promise<Comment[]>;

  /**
   * Busca comentário pelo id.
   *
   * Motivo:
   * necessário para aprovação, edição e exclusão.
   */
  findById(id: string): Promise<Comment | undefined>;

  /**
   * Atualiza parcialmente um comentário.
   */
  update(
    id: string,
    input: UpdateCommentRepositoryInput,
  ): Promise<Comment | undefined>;

  /**
   * Remove comentário pelo id.
   */
  deleteById(id: string): Promise<void>;

  /**
   * Lista comentários para moderação administrativa, com filtro opcional
   * por status, ordenação determinística e paginação.
   */
  listForModeration(
    input: ListCommentsForModerationInput,
  ): Promise<PaginatedComments>;
}
