import { HttpError } from '../core/domain/application/ApplicationError/http-error';
import type { Work } from '../core/domain/application/Work/work.types';
import type {
  CreateWorkInput,
  WorkRepositoryPort,
} from '../core/domain/repositories/work.repository';

export class CreateWorkUseCase {
  constructor(private readonly workRepository: WorkRepositoryPort) {}

  async execute(input: CreateWorkInput): Promise<Work> {
    if (!input.slug.trim()) {
      throw new HttpError(400, 'Slug é obrigatório.');
    }

    if (!input.title.trim()) {
      throw new HttpError(400, 'Título é obrigatório.');
    }

    if (!input.description.trim()) {
      throw new HttpError(400, 'Descrição é obrigatória.');
    }

    if (!input.category.trim()) {
      throw new HttpError(400, 'Categoria é obrigatória.');
    }

    const existingWork = await this.workRepository.findBySlug(input.slug);

    if (existingWork) {
      throw new HttpError(409, 'Já existe um trabalho com esse slug.');
    }

    return this.workRepository.create({
      ...input,
      slug: input.slug.trim().toLowerCase(),
      category: input.category.trim().toLowerCase(),
      tags: input.tags.map((tag) => tag.trim().toLowerCase()),
    });
  }
}
