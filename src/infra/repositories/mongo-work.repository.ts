import { randomUUID } from 'node:crypto';
import { sanitizeFilter } from 'mongoose';
import type {
  CreateWorkInput,
  UpdateWorkRepositoryInput,
  WorkRepositoryPort,
} from '../../core/domain/repositories/work.repository';
import type {
  Work,
  WorkImage,
} from '../../core/domain/application/Work/work.types';
import { WorkModel } from '../../data/models/work.model';
import { CommentModel } from '../../data/models/comment.model';
import { HttpError } from '../../core/domain/application/ApplicationError/http-error';

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const MAX_SLUG_LENGTH = 120;
const MAX_CATEGORY_LENGTH = 120;
const DANGEROUS_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

function isDuplicateKeyError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === 11000
  );
}

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
  /**
   * Garante que um identificador recebido pelo repositório é uma string
   * simples antes de ser usado na construção de um filtro do Mongo.
   *
   * Motivo:
   * o adaptador de persistência não deve confiar implicitamente na
   * validação feita por chamadores upstream; um valor com formato de
   * operador (ex.: `{ $ne: null }`) nunca pode alcançar um filtro do
   * MongoDB.
   */
  private assertStringIdentifier(value: unknown, fieldName: string): string {
    if (
      typeof value !== 'string' ||
      value.trim().length === 0 ||
      this.isDangerousKey(value)
    ) {
      throw new HttpError(400, `${fieldName} deve ser uma string válida.`);
    }

    return value;
  }

  /**
   * Identifica chaves perigosas para um filtro/documento do Mongo:
   * operadores do Mongo (`$...`), chaves com ponto (path aninhado) e
   * chaves usadas em ataques de prototype pollution.
   */
  private isDangerousKey(key: string): boolean {
    return key.startsWith('$') || key.includes('.') || DANGEROUS_KEYS.has(key);
  }

  /**
   * Canonicaliza e valida o slug com uma allowlist antes de usá-lo em uma
   * consulta. Isso impede que sintaxe de operadores MongoDB faça parte do
   * valor consultado, mesmo que a validação das camadas externas seja
   * contornada.
   */
  private sanitizeSlugIdentifier(value: unknown): string {
    const slug = this.assertStringIdentifier(value, 'slug')
      .trim()
      .toLowerCase();

    if (
      slug.length === 0 ||
      slug.length > MAX_SLUG_LENGTH ||
      !SLUG_PATTERN.test(slug)
    ) {
      throw new HttpError(400, 'slug deve possuir um formato válido.');
    }

    return slug;
  }

  private assertPlainString(value: unknown, fieldName: string): string {
    if (typeof value !== 'string') {
      throw new HttpError(400, `${fieldName} deve ser uma string válida.`);
    }

    return value;
  }

  /**
   * Reconstrói o payload de atualização recebido em um documento `$set`
   * explícito, contendo apenas os campos permitidos.
   *
   * Motivo:
   * nunca repassar o objeto recebido diretamente ao Mongoose; qualquer
   * chave de operador, chave com ponto ou chave de prototype pollution
   * rejeita a chamada inteira, sem mesclagem parcial. Também aplica as
   * mesmas normalizações já feitas antes de `WorkModel.create()`, pois o
   * hook `pre('save')` do model não roda em `findOneAndUpdate`.
   */
  private buildAllowlistedUpdate(input: UpdateWorkRepositoryInput): {
    $set: Record<string, unknown>;
  } {
    if (typeof input !== 'object' || input === null || Array.isArray(input)) {
      throw new HttpError(400, 'Dados de atualização inválidos.');
    }

    const prototype: unknown = Object.getPrototypeOf(input);

    if (prototype !== Object.prototype && prototype !== null) {
      throw new HttpError(400, 'Dados de atualização inválidos.');
    }

    const record = input as Record<string, unknown>;
    const keys = Object.keys(record);
    const hasOwn = (key: string): boolean => Object.hasOwn(record, key);

    if (keys.some((key) => this.isDangerousKey(key))) {
      throw new HttpError(
        400,
        'Dados de atualização contêm campos não permitidos.',
      );
    }

    const set: Record<string, unknown> = {};

    if (hasOwn('slug')) {
      set.slug = this.sanitizeSlugIdentifier(record.slug);
    }

    if (hasOwn('title')) {
      const title = this.assertPlainString(record.title, 'title').trim();

      if (title.length === 0) {
        throw new HttpError(400, 'Título é obrigatório.');
      }

      set.title = title;
    }

    if (hasOwn('description')) {
      const description = this.assertPlainString(
        record.description,
        'description',
      ).trim();

      if (description.length === 0) {
        throw new HttpError(400, 'Descrição é obrigatória.');
      }

      set.description = description;
    }

    if (hasOwn('category')) {
      const category = this.assertPlainString(record.category, 'category')
        .trim()
        .toLowerCase();

      if (category.length === 0) {
        throw new HttpError(400, 'Categoria é obrigatória.');
      }

      if (category.length > MAX_CATEGORY_LENGTH) {
        throw new HttpError(
          400,
          `Categoria deve ter no máximo ${MAX_CATEGORY_LENGTH} caracteres.`,
        );
      }

      set.category = category;
    }

    if (hasOwn('tags')) {
      if (!Array.isArray(record.tags)) {
        throw new HttpError(400, 'tags deve ser uma lista de strings.');
      }

      set.tags = record.tags
        .map((tag, index) =>
          this.assertPlainString(tag, `tags[${index}]`).trim().toLowerCase(),
        )
        .filter((tag) => tag.length > 0);
    }

    if (hasOwn('status')) {
      if (record.status !== 'draft' && record.status !== 'published') {
        throw new HttpError(400, 'status deve ser draft ou published.');
      }

      set.status = record.status;
      set.publishedAt = record.status === 'published' ? new Date() : null;
    }

    if (Object.keys(set).length === 0) {
      throw new HttpError(
        400,
        'Nenhum campo válido informado para atualização.',
      );
    }

    return { $set: set };
  }

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
    const validatedId = this.assertStringIdentifier(id, 'id');
    const filter = sanitizeFilter({
      id: validatedId,
      deletedAt: null,
    });
    const work = await WorkModel.findOne(filter).lean();
    return work ? toWork(work) : undefined;
  }

  /**
   * Busca work independentemente do soft delete.
   */
  async findByIdIncludingDeleted(id: string): Promise<Work | undefined> {
    const validatedId = this.assertStringIdentifier(id, 'id');
    const filter = sanitizeFilter({ id: validatedId });
    const work = await WorkModel.findOne(filter).lean();

    return work ? toWork(work) : undefined;
  }

  async findBySlug(slug: string): Promise<Work | undefined> {
    const sanitizedSlug = this.sanitizeSlugIdentifier(slug);
    const filter = sanitizeFilter({
      slug: sanitizedSlug,
      deletedAt: null,
    });
    const work = await WorkModel.findOne(filter).lean();

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
    const validatedId = this.assertStringIdentifier(id, 'id');
    const filter = sanitizeFilter({ id: validatedId, deletedAt: null });
    await WorkModel.updateOne(filter, { deletedAt: new Date() });
  }

  /**
   * Atualiza parcialmente um work ativo.
   */
  async update(
    id: string,
    input: UpdateWorkRepositoryInput,
  ): Promise<Work | undefined> {
    const validatedId = this.assertStringIdentifier(id, 'id');
    const update = this.buildAllowlistedUpdate(input);
    const filter = sanitizeFilter({ id: validatedId, deletedAt: null });
    let updated: WorkPersistenceDocument | null;

    try {
      updated = await WorkModel.findOneAndUpdate(filter, update, {
        new: true,
      }).lean();
    } catch (error: unknown) {
      if (isDuplicateKeyError(error)) {
        throw new HttpError(409, 'Já existe um trabalho com esse slug.');
      }

      throw error;
    }

    return updated ? toWork(updated) : undefined;
  }

  async hardDelete(id: string): Promise<void> {
    const validatedId = this.assertStringIdentifier(id, 'id');
    const filter = sanitizeFilter({ id: validatedId });
    await WorkModel.deleteOne(filter);
    await CommentModel.deleteMany({ workId: validatedId });
  }

  async hardDeleteData(id: string): Promise<boolean> {
    const validatedId = this.assertStringIdentifier(id, 'id');
    const filter = sanitizeFilter({ id: validatedId });
    const result = await WorkModel.deleteOne(filter);

    return result.deletedCount > 0;
  }

  async addImage(workId: string, image: WorkImage): Promise<Work | undefined> {
    const validatedWorkId = this.assertStringIdentifier(workId, 'workId');

    /**
     * Se a nova imagem for capa, removemos a capa das outras.
     * Motivo:
     * garantir que só exista uma imagem principal.
     */
    if (image.isCover) {
      const setCoverFilter = sanitizeFilter({ id: validatedWorkId });
      await WorkModel.updateOne(setCoverFilter, {
        $set: {
          'images.$[].isCover': false,
        },
      });
    }

    const pushImageFilter = sanitizeFilter({
      id: validatedWorkId,
      deletedAt: null,
    });
    await WorkModel.updateOne(pushImageFilter, {
      $push: {
        images: image,
      },
    });

    return this.findById(validatedWorkId);
  }

  async removeImage(workId: string, imageId: string): Promise<void> {
    const validatedWorkId = this.assertStringIdentifier(workId, 'workId');
    const validatedImageId = this.assertStringIdentifier(imageId, 'imageId');
    const filter = sanitizeFilter({ id: validatedWorkId });
    await WorkModel.updateOne(filter, {
      $pull: {
        images: { id: validatedImageId },
      },
    });
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
