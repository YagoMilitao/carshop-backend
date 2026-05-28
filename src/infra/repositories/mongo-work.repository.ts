import { randomUUID } from 'crypto';
import type {
  CreateWorkInput,
  WorkRepositoryPort,
  WorkStatus,
} from '../../core/domain/repositories/work.repository';
import type { Work } from '../../core/domain/application/Work/work.types';
import { WorkModel } from '../../data/models/work.model';
import { CommentModel } from '../../data/models/comment.model';

function toWork(document: {
  id: string;
  slug: string;
  title: string;
  description: string;
  category: string;
  tags: string[];
  status: WorkStatus;
  createdAt: Date;
  updatedAt: Date;
}): Work {
  return {
    id: document.id,
    slug: document.slug,
    title: document.title,
    description: document.description,
    category: document.category,
    tags: document.tags,
    status: document.status,
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

  async findById(id: string): Promise<Work | undefined> {
    const work = await WorkModel.findOne({ id, deletedAt: null }).lean();
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
}
