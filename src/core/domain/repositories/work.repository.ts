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
  findById(id: string): Promise<Work | undefined>;

  /**
   * Também retorna works removidos logicamente.
   *
   * Necessário para o hard delete, porque findById normalmente
   * filtra deletedAt: null.
   */
  findByIdIncludingDeleted(id: string): Promise<Work | undefined>;

  /**
   * Salva os metadados de uma imagem no Work.
   */
  addImage(workId: string, image: WorkImage): Promise<Work | undefined>;

  /**
   * Remove somente os dados persistidos no Mongo.
   *
   * A remoção no storage é responsabilidade do caso de uso,
   * pois o repository não deve conhecer Cloudinary.
   */
  hardDeleteData(id: string): Promise<boolean>;
}
