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
  images: WorkImage[];
  status: WorkStatus;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string | null;
}

/**
 * Imagem vinculada a um trabalho.
 */
export interface WorkImage {
  id: string;
  url: string;
  publicId: string;
  alt: string;
  isCover: boolean;
  order: number;
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
