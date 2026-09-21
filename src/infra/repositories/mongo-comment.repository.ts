import { randomUUID } from 'node:crypto';
import { sanitizeFilter } from 'mongoose';
import type {
  AdminCommentStatusFilter,
  CommentRepositoryPort,
  CreateCommentRepositoryInput,
  ListCommentsForModerationInput,
  PaginatedComments,
  UpdateCommentRepositoryInput,
} from '../../core/domain/repositories/comment.repository';
import type { Comment } from '../../core/domain/application/Work/work.types';
import { CommentModel } from '../../data/models/comment.model';
import { HttpError } from '../../core/domain/application/ApplicationError/http-error';

const DANGEROUS_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

/**
 * Repository Mongo para comentários.
 *
 * Motivo:
 * concentrar persistência e leitura dos comentários no banco.
 */
function toComment(document: {
  id: string;
  workId: string;
  authorName: string;
  content: string;
  status: 'PENDING' | 'APPROVED';
  createdAt: Date;
  updatedAt: Date;
}): Comment {
  return {
    id: document.id,
    workId: document.workId,
    authorName: document.authorName,
    content: document.content,
    status: document.status,
    createdAt: document.createdAt.toISOString(),
    updatedAt: document.updatedAt.toISOString(),
  };
}
export class MongoCommentRepository implements CommentRepositoryPort {
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
   * Valida o identificador e monta um filtro sanitizado com o Mongoose
   * antes de qualquer consulta/mutação por `id`.
   */
  private buildSanitizedIdFilter(id: unknown): Record<string, unknown> {
    const validatedId = this.assertStringIdentifier(id, 'id');
    return sanitizeFilter({ id: validatedId });
  }

  /**
   * Identifica chaves perigosas para um documento de atualização: operadores
   * do Mongo (`$...`), chaves com ponto (path aninhado) e chaves usadas em
   * ataques de prototype pollution.
   */
  private isDangerousKey(key: string): boolean {
    return key.startsWith('$') || key.includes('.') || DANGEROUS_KEYS.has(key);
  }

  /**
   * Valida o filtro opcional de status recebido pela listagem de
   * moderação.
   *
   * Motivo:
   * defesa em profundidade — o Zod já restringe o valor na camada de
   * apresentação, mas o repositório não deve confiar apenas nisso antes
   * de montar um filtro do Mongo.
   */
  private assertValidStatusFilter(
    value: unknown,
  ): AdminCommentStatusFilter | undefined {
    if (value === undefined) {
      return undefined;
    }

    if (value !== 'PENDING' && value !== 'APPROVED' && value !== 'HIDDEN') {
      throw new HttpError(400, 'status deve ser PENDING, APPROVED ou HIDDEN.');
    }

    return value;
  }

  /**
   * Garante que um valor de paginação é um inteiro positivo antes de ser
   * usado em `skip`/`limit`.
   */
  private assertPositiveInteger(value: unknown, fieldName: string): number {
    if (typeof value !== 'number' || !Number.isInteger(value) || value < 1) {
      throw new HttpError(400, `${fieldName} deve ser um inteiro positivo.`);
    }

    return value;
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
   * rejeita a chamada inteira, sem mesclagem parcial.
   */
  private buildAllowlistedUpdate(input: UpdateCommentRepositoryInput): {
    $set: Record<string, string>;
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

    const set: Record<string, string> = {};

    if (hasOwn('authorName')) {
      set.authorName = this.assertPlainString(record.authorName, 'authorName');
    }

    if (hasOwn('content')) {
      set.content = this.assertPlainString(record.content, 'content');
    }

    if (hasOwn('status')) {
      if (record.status !== 'PENDING' && record.status !== 'APPROVED') {
        throw new HttpError(400, 'status deve ser PENDING ou APPROVED.');
      }

      set.status = record.status;
    }

    if (Object.keys(set).length === 0) {
      throw new HttpError(
        400,
        'Nenhum campo válido informado para atualização.',
      );
    }

    return { $set: set };
  }

  /**
   * Cria comentário sempre como PENDING.
   *
   * Motivo:
   * comentário público precisa passar por moderação.
   */
  async createPending(input: CreateCommentRepositoryInput): Promise<Comment> {
    const workId = this.assertPlainString(input.workId, 'workId');
    const authorName = this.assertPlainString(input.authorName, 'authorName');
    const content = this.assertPlainString(input.content, 'content');

    const created = await CommentModel.create({
      id: randomUUID(),
      workId,
      authorName,
      content,
      status: 'PENDING',
    });

    return toComment(created);
  }

  /**
   * Lista apenas comentários aprovados de um trabalho.
   */
  async listApprovedByWorkId(workId: string): Promise<Comment[]> {
    const validatedWorkId = this.assertStringIdentifier(workId, 'workId');
    const filter = sanitizeFilter({
      workId: validatedWorkId,
      status: 'APPROVED',
    });

    const comments = await CommentModel.find(filter)
      .sort({ createdAt: -1 })
      .lean();

    return comments.map(toComment);
  }

  /**
   * Busca comentário pelo id.
   */
  async findById(id: string): Promise<Comment | undefined> {
    const comment = await CommentModel.findOne(
      this.buildSanitizedIdFilter(id),
    ).lean();
    return comment ? toComment(comment) : undefined;
  }

  /**
   * Atualiza comentário parcialmente.
   */
  async update(
    id: string,
    input: UpdateCommentRepositoryInput,
  ): Promise<Comment | undefined> {
    const filter = this.buildSanitizedIdFilter(id);
    const update = this.buildAllowlistedUpdate(input);

    const updated = await CommentModel.findOneAndUpdate(filter, update, {
      new: true,
    }).lean();

    return updated ? toComment(updated) : undefined;
  }

  /**
   * Remove comentário definitivamente.
   */
  async deleteById(id: string): Promise<void> {
    await CommentModel.deleteOne(this.buildSanitizedIdFilter(id));
  }

  /**
   * Lista comentários para moderação administrativa, com filtro opcional
   * por status, ordenação determinística (`createdAt` desc, `_id` desc
   * como desempate) e paginação.
   */
  async listForModeration(
    input: ListCommentsForModerationInput,
  ): Promise<PaginatedComments> {
    const status = this.assertValidStatusFilter(input.status);
    const page = this.assertPositiveInteger(input.page, 'page');
    const limit = this.assertPositiveInteger(input.limit, 'limit');

    const filter = sanitizeFilter(status ? { status } : {});
    const skip = (page - 1) * limit;

    const [documents, total] = await Promise.all([
      CommentModel.find(filter)
        .sort({ createdAt: -1, _id: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      CommentModel.countDocuments(filter),
    ]);

    return {
      items: documents.map(toComment),
      page,
      limit,
      total,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    };
  }
}
