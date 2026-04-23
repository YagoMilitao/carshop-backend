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
}
