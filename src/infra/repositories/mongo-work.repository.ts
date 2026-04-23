import { randomUUID } from 'crypto';
import type {
  CreateWorkInput,
  WorkRepositoryPort,
} from '../../core/domain/repositories/work.repository';
import type { Work } from '../../core/domain/application/Work/work.types';
import { WorkModel } from '../../data/models/work.model';
import { WorkImageModel } from '../../data/models/work-image.model';
import { CommentModel } from '../../data/models/comment.model';

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
    });

    return {
      id: created.id,
      slug: created.slug,
      title: created.title,
      description: created.description,
      category: created.category,
      tags: created.tags,
      status: created.status,
      createdAt: created.createdAt.toISOString(),
      updatedAt: created.updatedAt.toISOString(),
    };
  }

  async listPublished(): Promise<Work[]> {
    const works = await WorkModel.find({ status: 'published' })
      .sort({ createdAt: -1 })
      .lean();

    return works.map((work) => ({
      id: work.id,
      slug: work.slug,
      title: work.title,
      description: work.description,
      category: work.category,
      tags: work.tags,
      status: work.status,
      createdAt: work.createdAt.toISOString(),
      updatedAt: work.updatedAt.toISOString(),
    }));
  }

  async listAll(): Promise<Work[]> {
    const works = await WorkModel.find().sort({ createdAt: -1 }).lean();

    return works.map((work) => ({
      id: work.id,
      slug: work.slug,
      title: work.title,
      description: work.description,
      category: work.category,
      tags: work.tags,
      status: work.status,
      createdAt: work.createdAt.toISOString(),
      updatedAt: work.updatedAt.toISOString(),
    }));
  }

  async findBySlug(slug: string): Promise<Work | undefined> {
    const work = await WorkModel.findOne({ slug }).lean();

    if (!work) {
      return undefined;
    }

    return {
      id: work.id,
      slug: work.slug,
      title: work.title,
      description: work.description,
      category: work.category,
      tags: work.tags,
      status: work.status,
      createdAt: work.createdAt.toISOString(),
      updatedAt: work.updatedAt.toISOString(),
    };
  }

  /**
   * Delete em cascata manual.
   *
   * No Mongo não existe cascade delete automático como em banco relacional.
   * Então removemos:
   * - work
   * - imagens do work
   * - comentários do work
   */
  async deleteById(id: string): Promise<void> {
    await WorkModel.deleteOne({ id });
    await WorkImageModel.deleteMany({ workId: id });
    await CommentModel.deleteMany({ workId: id });
  }

  async findById(id: string): Promise<Work | undefined> {
    const work = await WorkModel.findOne({ id }).lean();

    if (!work) {
      return undefined;
    }

    return {
      id: work.id,
      slug: work.slug,
      title: work.title,
      description: work.description,
      category: work.category,
      tags: work.tags,
      status: work.status,
      createdAt: work.createdAt.toISOString(),
      updatedAt: work.updatedAt.toISOString(),
    };
  }
}
