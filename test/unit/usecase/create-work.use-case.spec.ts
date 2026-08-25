import { CreateWorkUseCase } from '../../../src/usecase/create-work.use-case';
import type {
  CreateWorkInput,
  WorkRepositoryPort,
} from '../../../src/core/domain/repositories/work.repository';
import type { Work } from '../../../src/core/domain/application/Work/work.types';

describe('CreateWorkUseCase', () => {
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

  const validInput: CreateWorkInput = {
    slug: '  Work-Slug  ',
    title: 'Work title',
    description: 'Work description',
    category: '  Bancos  ',
    tags: [' Couro ', 'HONDA'],
    status: 'draft',
  };

  const createdWork: Work = {
    id: 'work-1',
    slug: 'work-slug',
    title: 'Work title',
    description: 'Work description',
    category: 'bancos',
    tags: ['couro', 'honda'],
    images: [],
    status: 'draft',
    deletedAt: null,
    createdAt: '2024-01-01T00:00:00.000Z',
    updatedAt: '2024-01-01T00:00:00.000Z',
  };

  it('cria um work normalizando slug, categoria e tags', async () => {
    const workRepository = buildWorkRepository({
      findBySlug: jest.fn().mockResolvedValue(undefined),
      create: jest.fn().mockResolvedValue(createdWork),
    });

    const useCase = new CreateWorkUseCase(workRepository);

    const result = await useCase.execute(validInput);

    expect(result).toEqual(createdWork);
    expect(workRepository.create).toHaveBeenCalledWith({
      ...validInput,
      slug: 'work-slug',
      category: 'bancos',
      tags: ['couro', 'honda'],
    });
  });

  it('retorna 400 quando o slug está vazio', async () => {
    const workRepository = buildWorkRepository();
    const useCase = new CreateWorkUseCase(workRepository);

    await expect(
      useCase.execute({ ...validInput, slug: '   ' }),
    ).rejects.toMatchObject({ statusCode: 400 });
    expect(workRepository.create).not.toHaveBeenCalled();
  });

  it('retorna 400 quando o título está vazio', async () => {
    const workRepository = buildWorkRepository();
    const useCase = new CreateWorkUseCase(workRepository);

    await expect(
      useCase.execute({ ...validInput, title: '   ' }),
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it('retorna 400 quando a descrição está vazia', async () => {
    const workRepository = buildWorkRepository();
    const useCase = new CreateWorkUseCase(workRepository);

    await expect(
      useCase.execute({ ...validInput, description: '   ' }),
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it('retorna 400 quando a categoria está vazia', async () => {
    const workRepository = buildWorkRepository();
    const useCase = new CreateWorkUseCase(workRepository);

    await expect(
      useCase.execute({ ...validInput, category: '   ' }),
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it('retorna 409 quando já existe um work com o mesmo slug', async () => {
    const workRepository = buildWorkRepository({
      findBySlug: jest.fn().mockResolvedValue(createdWork),
    });
    const useCase = new CreateWorkUseCase(workRepository);

    await expect(useCase.execute(validInput)).rejects.toMatchObject({
      statusCode: 409,
    });
    expect(workRepository.create).not.toHaveBeenCalled();
  });
});
