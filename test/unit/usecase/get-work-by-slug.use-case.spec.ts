import { GetWorkBySlugUseCase } from '../../../src/usecase/get-work-by-slug.use-case';
import { HttpError } from '../../../src/core/domain/application/ApplicationError/http-error';
import type { WorkRepositoryPort } from '../../../src/core/domain/repositories/work.repository';
import type { Work } from '../../../src/core/domain/application/Work/work.types';

describe('GetWorkBySlugUseCase', () => {
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
      findByIdIncludingDeleted: jest.fn(),
      addImage: jest.fn(),
      removeImage: jest.fn(),
      hardDeleteData: jest.fn(),
      listDeletedBefore: jest.fn(),
      ...overrides,
    }) as jest.Mocked<WorkRepositoryPort>;

  const buildWork = (overrides: Partial<Work> = {}): Work => ({
    id: 'work-1',
    slug: 'work-slug',
    title: 'Work title',
    description: 'Work description',
    category: 'bancos',
    tags: [],
    images: [],
    status: 'published',
    deletedAt: null,
    createdAt: '2024-01-01T00:00:00.000Z',
    updatedAt: '2024-01-01T00:00:00.000Z',
    ...overrides,
  });

  it('retorna o trabalho quando publicado e não removido (AC-001)', async () => {
    const work = buildWork();
    const workRepository = buildWorkRepository({
      findBySlug: jest.fn().mockResolvedValue(work),
    });

    const useCase = new GetWorkBySlugUseCase(workRepository);

    const result = await useCase.execute('work-slug');

    expect(result).toEqual(work);
    expect(workRepository.findBySlug).toHaveBeenCalledWith('work-slug');
  });

  it('lança HttpError 404 quando nenhum trabalho é encontrado (AC-002)', async () => {
    const workRepository = buildWorkRepository({
      findBySlug: jest.fn().mockResolvedValue(undefined),
    });

    const useCase = new GetWorkBySlugUseCase(workRepository);

    await expect(useCase.execute('does-not-exist')).rejects.toThrow(
      HttpError,
    );
    await expect(useCase.execute('does-not-exist')).rejects.toMatchObject({
      statusCode: 404,
    });
  });

  it('lança HttpError 404 quando o trabalho está em rascunho (AC-003)', async () => {
    const draftWork = buildWork({ status: 'draft' });
    const workRepository = buildWorkRepository({
      findBySlug: jest.fn().mockResolvedValue(draftWork),
    });

    const useCase = new GetWorkBySlugUseCase(workRepository);

    await expect(useCase.execute('draft-slug')).rejects.toMatchObject({
      statusCode: 404,
    });
  });

  it('lança HttpError 404 quando o trabalho está removido logicamente (AC-004)', async () => {
    const deletedWork = buildWork({ deletedAt: '2024-02-01T00:00:00.000Z' });
    const workRepository = buildWorkRepository({
      findBySlug: jest.fn().mockResolvedValue(deletedWork),
    });

    const useCase = new GetWorkBySlugUseCase(workRepository);

    await expect(useCase.execute('deleted-slug')).rejects.toMatchObject({
      statusCode: 404,
    });
  });
});
