import type { Work } from '../core/domain/application/Work/work.types';
import type { WorkRepositoryPort } from '../core/domain/repositories/work.repository';

export class ListWorksUseCase {
  constructor(private readonly workRepository: WorkRepositoryPort) {}

  async execute(input?: { includeDrafts?: boolean }): Promise<Work[]> {
    if (input?.includeDrafts) {
      return this.workRepository.listAll();
    }

    return this.workRepository.listPublished();
  }
}
