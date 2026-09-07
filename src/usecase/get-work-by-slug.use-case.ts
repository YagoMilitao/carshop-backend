import { HttpError } from '../core/domain/application/ApplicationError/http-error';
import type { Work } from '../core/domain/application/Work/work.types';
import type { WorkRepositoryPort } from '../core/domain/repositories/work.repository';

export class GetWorkBySlugUseCase {
  constructor(private readonly workRepository: WorkRepositoryPort) {}

  async execute(slug: string): Promise<Work> {
    const work = await this.workRepository.findBySlug(slug);

    if (!work || work.status !== 'published' || work.deletedAt) {
      throw new HttpError(404, 'Trabalho não encontrado.');
    }

    return work;
  }
}
