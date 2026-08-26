import { ListWorksUseCase } from '../../../src/usecase/list-works.use-case';
import type { WorkRepositoryPort } from '../../../src/core/domain/repositories/work.repository';
import type { Work } from '../../../src/core/domain/application/Work/work.types';

describe('ListWorksUseCase', () => {
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

  const works: Work[] = [
    {
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
    },
  ];

  it('lista apenas trabalhos publicados por padrão', async () => {
    const workRepository = buildWorkRepository({
      listPublished: jest.fn().mockResolvedValue(works),
    });

    const useCase = new ListWorksUseCase(workRepository);

    const result = await useCase.execute();

    expect(result).toEqual(works);
    expect(workRepository.listPublished).toHaveBeenCalled();
    expect(workRepository.listAll).not.toHaveBeenCalled();
  });

  it('lista todos os trabalhos quando includeDrafts é true', async () => {
    const workRepository = buildWorkRepository({
      listAll: jest.fn().mockResolvedValue(works),
    });

    const useCase = new ListWorksUseCase(workRepository);

    const result = await useCase.execute({ includeDrafts: true });

    expect(result).toEqual(works);
    expect(workRepository.listAll).toHaveBeenCalled();
    expect(workRepository.listPublished).not.toHaveBeenCalled();
  });
});
