/**
 * Status de moderação do comentário.
 */
export type CommentStatus = 'PENDING' | 'APPROVED';

/**
 * Status de publicação do trabalho.
 */
export type WorkStatus = 'draft' | 'published';

/**
 * Entidade principal do trabalho.
 */
export interface Work {
  id: string;
  slug: string;
  title: string;
  description: string;
  category: string;
  tags: string[];
  status: WorkStatus;
  createdAt: string;
  updatedAt: string;
}

/**
 * Imagem vinculada a um trabalho.
 */
export interface WorkImage {
  id: string;
  workId: string;
  url: string;
  alt: string;
  isCover: boolean;
  createdAt: string;
  updatedAt: string;
}

/**
 * Comentário de um trabalho.
 */
export interface Comment {
  id: string;
  workId: string;
  authorName: string;
  content: string;
  status: CommentStatus;
  createdAt: string;
  updatedAt: string;
}
