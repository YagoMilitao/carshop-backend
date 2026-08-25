import { randomUUID } from 'crypto';
import type {
  CreateWorkInput,
  WorkRepositoryPort,
  WorkStatus,
} from '../../core/domain/repositories/work.repository';
import type {
  Work,
  WorkImage,
} from '../../core/domain/application/Work/work.types';
import { WorkModel } from '../../data/models/work.model';
import { CommentModel } from '../../data/models/comment.model';

type WorkPersistenceDocument = {
  id: string;
  slug: string;
  title: string;
  description: string;
  category: string;
  tags: string[];
  images: Array<{
    id: string;
    url: string;
    publicId: string;
    alt: string;
    isCover: boolean;
    order: number;
  }>;
  status: 'draft' | 'published';
  deletedAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

function toWork(document: WorkPersistenceDocument): Work {
  return {
    id: document.id,
    slug: document.slug,
    title: document.title,
    description: document.description,
    category: document.category,
    tags: document.tags,
    images: (document.images ?? []).map((image) => ({
      id: image.id,
      url: image.url,
      publicId: image.publicId,
      alt: image.alt,
      isCover: image.isCover,
      order: image.order,
      createdAt: document.createdAt.toISOString(),
      updatedAt: document.updatedAt.toISOString(),
    })),
    status: document.status,
    deletedAt: document.deletedAt?.toISOString() ?? null,
    createdAt: document.createdAt.toISOString(),
    updatedAt: document.updatedAt.toISOString(),
  };
}

/**
 * Repository Mongo para trabalhos do portfólio.
 *
 * Responsabilidade:
 * persistir e consultar trabalhos.
 */
export class MongoWorkRepository implements WorkRepositoryPort {
  async create(input: CreateWorkInput): Promise<Work> {
    const created = await WorkModel.create({
      id: randomUUID(),
      slug: input.slug,
      title: input.title,
      description: input.description,
      category: input.category,
      tags: input.tags,
      status: input.status,
      metadata: input.metadata ?? {},
      seo: input.seo ?? {},
      publishedAt: input.status === 'published' ? new Date() : null,
      deletedAt: null,
    });

    return toWork(created);
  }
  /**
   * Busca work ativo.
   */
  async findById(id: string): Promise<Work | undefined> {
    const work = await WorkModel.findOne({ id, deletedAt: null }).lean();
    return work ? toWork(work) : undefined;
  }

  /**
   * Busca work independentemente do soft delete.
   */
  async findByIdIncludingDeleted(id: string): Promise<Work | undefined> {
    const work = await WorkModel.findOne({ id }).lean();

    return work ? toWork(work) : undefined;
  }

  async findBySlug(slug: string): Promise<Work | undefined> {
    const work = await WorkModel.findOne({
      slug,
      deletedAt: null,
    }).lean();

    return work ? toWork(work) : undefined;
  }

  async listPublished(): Promise<Work[]> {
    const works = await WorkModel.find({
      status: 'published',
      deletedAt: null,
    })
      .sort({ createdAt: -1 })
      .lean();

    return works.map(toWork);
  }

  async listAll(): Promise<Work[]> {
    const works = await WorkModel.find({
      deletedAt: null,
    })
      .sort({ createdAt: -1 })
      .lean();

    return works.map(toWork);
  }

  async softDelete(id: string): Promise<void> {
    await WorkModel.updateOne(
      { id, deletedAt: null },
      { deletedAt: new Date() },
    );
  }

  async hardDelete(id: string): Promise<void> {
    await WorkModel.deleteOne({ id });
    await CommentModel.deleteMany({ workId: id });
  }

  async hardDeleteData(id: string): Promise<boolean> {
    const result = await WorkModel.deleteOne({ id });

    return result.deletedCount > 0;
  }

  async addImage(workId: string, image: WorkImage): Promise<Work | undefined> {
    /**
     * Se a nova imagem for capa, removemos a capa das outras.
     * Motivo:
     * garantir que só exista uma imagem principal.
     */
    if (image.isCover) {
      await WorkModel.updateOne(
        { id: workId },
        {
          $set: {
            'images.$[].isCover': false,
          },
        },
      );
    }

    await WorkModel.updateOne(
      { id: workId, deletedAt: null },
      {
        $push: {
          images: image,
        },
      },
    );

    return this.findById(workId);
  }

  async removeImage(workId: string, imageId: string): Promise<void> {
    await WorkModel.updateOne(
      { id: workId },
      {
        $pull: {
          images: { id: imageId },
        },
      },
    );
  }

  /**
   * Lista works removidos logicamente há mais tempo que `cutoffDate`.
   */
  async listDeletedBefore(cutoffDate: Date): Promise<Work[]> {
    const works = await WorkModel.find({
      deletedAt: { $ne: null, $lte: cutoffDate },
    })
      .sort({ deletedAt: 1 })
      .lean();

    return works.map(toWork);
  }
}
