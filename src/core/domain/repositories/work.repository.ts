import type { Work } from '../application/Work/work.types';

export interface CreateWorkInput {
  slug: string;
  title: string;
  description: string;
  category: string;
  tags: string[];
  status: 'draft' | 'published';
}

export interface WorkRepositoryPort {
  create(input: CreateWorkInput): Promise<Work>;
  listPublished(): Promise<Work[]>;
  listAll(): Promise<Work[]>;
  findById(id: string): Promise<Work | undefined>;
  findBySlug(slug: string): Promise<Work | undefined>;
  deleteById(id: string): Promise<void>;
}
