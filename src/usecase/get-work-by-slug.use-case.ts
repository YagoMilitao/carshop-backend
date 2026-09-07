import { HttpError } from '../core/domain/application/ApplicationError/http-error';
import type { Work } from '../core/domain/application/Work/work.types';
import type { WorkRepositoryPort } from '../core/domain/repositories/work.repository';

export class GetWorkBySlugUseCase {
  constructor(private readonly workRepository: WorkRepositoryPort) {}

  async execute(slug: string): Promise<Work> {
    let work: Work | undefined;

    try {
      work = await this.workRepository.findBySlug(slug);
    } catch (error: unknown) {
      if (error instanceof HttpError && error.statusCode === 400) {
        throw new HttpError(404, 'Trabalho não encontrado.');
      }

      throw error;
    }

    if (work?.status !== 'published' || work.deletedAt) {
      throw new HttpError(404, 'Trabalho não encontrado.');
    }

    return work;
  }
}
