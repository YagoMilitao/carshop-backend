import { UpdateWorkUseCase } from '../../../src/usecase/update-work.use-case';
import type { WorkRepositoryPort } from '../../../src/core/domain/repositories/work.repository';
import type { Work } from '../../../src/core/domain/application/Work/work.types';

describe('UpdateWorkUseCase', () => {
  const buildWorkRepository = (
    overrides: Partial<WorkRepositoryPort> = {},
  ): jest.Mocked<WorkRepositoryPort> =>
    ({
      create: jest.fn(),
      findById: jest.fn(),
      findBySlug: jest.fn(),
      listPublished: jest.fn(),
      listAll: jest.fn(),
      softDelete: jest.fn(),
      hardDelete: jest.fn(),
      update: jest.fn(),
      findByIdIncludingDeleted: jest.fn(),
      addImage: jest.fn(),
      removeImage: jest.fn(),
      hardDeleteData: jest.fn(),
      listDeletedBefore: jest.fn(),
      ...overrides,
    }) as jest.Mocked<WorkRepositoryPort>;

  const existingWork: Work = {
    id: 'work-1',
    slug: 'work-slug',
    title: 'Work title',
    description: 'Work description',
    category: 'bancos',
    tags: ['couro'],
    images: [],
    status: 'draft',
    deletedAt: null,
    createdAt: '2024-01-01T00:00:00.000Z',
    updatedAt: '2024-01-01T00:00:00.000Z',
  };

  it('atualiza parcialmente um work existente e retorna o resultado persistido (AC-001, FR-001, FR-007)', async () => {
    const updatedWork: Work = { ...existingWork, title: 'Novo título' };
    const workRepository = buildWorkRepository({
      findById: jest.fn().mockResolvedValue(existingWork),
      update: jest.fn().mockResolvedValue(updatedWork),
    });

    const useCase = new UpdateWorkUseCase(workRepository);

    const result = await useCase.execute('work-1', { title: 'Novo título' });

    expect(result).toEqual(updatedWork);
    expect(workRepository.findById).toHaveBeenCalledWith('work-1');
    expect(workRepository.findBySlug).not.toHaveBeenCalled();
    expect(workRepository.update).toHaveBeenCalledWith('work-1', {
      title: 'Novo título',
    });
  });

  it('retorna 404 quando o work não existe (AC-003, FR-005)', async () => {
    const workRepository = buildWorkRepository({
      findById: jest.fn().mockResolvedValue(undefined),
    });

    const useCase = new UpdateWorkUseCase(workRepository);

    await expect(
      useCase.execute('missing-work', { title: 'Novo título' }),
    ).rejects.toMatchObject({ statusCode: 404 });
    expect(workRepository.update).not.toHaveBeenCalled();
  });

  it('retorna 409 quando o slug informado já pertence a outro work (AC-004, FR-006)', async () => {
    const otherWork: Work = { ...existingWork, id: 'work-2', slug: 'outro-slug' };
    const workRepository = buildWorkRepository({
      findById: jest.fn().mockResolvedValue(existingWork),
      findBySlug: jest.fn().mockResolvedValue(otherWork),
    });

    const useCase = new UpdateWorkUseCase(workRepository);

    await expect(
      useCase.execute('work-1', { slug: 'outro-slug' }),
    ).rejects.toMatchObject({ statusCode: 409 });
    expect(workRepository.update).not.toHaveBeenCalled();
  });

  it('não conflita quando o slug encontrado pertence ao próprio work sendo atualizado (AC-001)', async () => {
    const updatedWork: Work = { ...existingWork, slug: 'work-slug' };
    const workRepository = buildWorkRepository({
      findById: jest.fn().mockResolvedValue(existingWork),
      findBySlug: jest.fn().mockResolvedValue(existingWork),
      update: jest.fn().mockResolvedValue(updatedWork),
    });

    const useCase = new UpdateWorkUseCase(workRepository);

    const result = await useCase.execute('work-1', { slug: 'work-slug' });

    expect(result).toEqual(updatedWork);
    expect(workRepository.update).toHaveBeenCalledWith('work-1', {
      slug: 'work-slug',
    });
  });

  it('normaliza o slug (trim/lowercase) antes de checar conflito com outro work', async () => {
    const workRepository = buildWorkRepository({
      findById: jest.fn().mockResolvedValue(existingWork),
      findBySlug: jest.fn().mockResolvedValue(undefined),
      update: jest.fn().mockResolvedValue(existingWork),
    });

    const useCase = new UpdateWorkUseCase(workRepository);

    await useCase.execute('work-1', { slug: '  Novo-Slug  ' });

    expect(workRepository.findBySlug).toHaveBeenCalledWith('novo-slug');
  });

  it('retorna 404 quando update() retorna undefined (corrida entre a checagem e a persistência)', async () => {
    const workRepository = buildWorkRepository({
      findById: jest.fn().mockResolvedValue(existingWork),
      update: jest.fn().mockResolvedValue(undefined),
    });

    const useCase = new UpdateWorkUseCase(workRepository);

    await expect(
      useCase.execute('work-1', { title: 'Novo título' }),
    ).rejects.toMatchObject({ statusCode: 404 });
  });
});
