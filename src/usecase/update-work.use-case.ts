import { HttpError } from '../core/domain/application/ApplicationError/http-error';
import type { Work } from '../core/domain/application/Work/work.types';
import type {
  UpdateWorkRepositoryInput,
  WorkRepositoryPort,
} from '../core/domain/repositories/work.repository';

/**
 * Edita um trabalho existente via admin.
 *
 * Motivo:
 * permitir atualização parcial dos campos editáveis de um work já criado,
 * reutilizando o modelo/porta de domínio existentes.
 */
export class UpdateWorkUseCase {
  constructor(private readonly workRepository: WorkRepositoryPort) {}

  async execute(
    workId: string,
    input: UpdateWorkRepositoryInput,
  ): Promise<Work> {
    const existing = await this.workRepository.findById(workId);

    if (!existing) {
      throw new HttpError(404, 'Trabalho não encontrado.');
    }

    if (input.slug !== undefined) {
      const normalizedSlug = input.slug.trim().toLowerCase();
      const conflicting = await this.workRepository.findBySlug(normalizedSlug);

      if (conflicting && conflicting.id !== workId) {
        throw new HttpError(409, 'Já existe um trabalho com esse slug.');
      }
    }

    const updated = await this.workRepository.update(workId, input);

    if (!updated) {
      throw new HttpError(404, 'Trabalho não encontrado.');
    }

    return updated;
  }
}
