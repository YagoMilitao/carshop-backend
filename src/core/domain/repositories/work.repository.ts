import { Work, WorkImage } from '../application/Work/work.types';

export type WorkStatus = 'draft' | 'published';
export interface CreateWorkInput {
  slug: string;
  title: string;
  description: string;
  category: string;
  tags: string[];
  status: WorkStatus;
  metadata?: {
    vehicleBrand?: string;
    vehicleModel?: string;
    serviceType?: string;
  };
  seo?: {
    metaTitle?: string;
    metaDescription?: string;
    keywords?: string[];
  };
}

export interface WorkRepositoryPort {
  create(input: CreateWorkInput): Promise<Work>;
  findById(id: string): Promise<Work | undefined>;
  findBySlug(slug: string): Promise<Work | undefined>;
  listPublished(): Promise<Work[]>;
  listAll(): Promise<Work[]>;
  softDelete(id: string): Promise<void>;
  hardDelete(id: string): Promise<void>;
  addImage(workId: string, image: WorkImage): Promise<void>;
}
