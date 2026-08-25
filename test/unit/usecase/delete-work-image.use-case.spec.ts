import { DeleteWorkImageUseCase } from '../../../src/usecase/delete-work-image.use-case';
import type { WorkRepositoryPort } from '../../../src/core/domain/repositories/work.repository';
import type { ImageStoragePort } from '../../../src/core/domain/application/Storage/image-storage.port';
import type { Work } from '../../../src/core/domain/application/Work/work.types';

describe('DeleteWorkImageUseCase', () => {
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

  const buildImageStorage = (
    overrides: Partial<ImageStoragePort> = {},
  ): jest.Mocked<ImageStoragePort> =>
    ({
      upload: jest.fn(),
      delete: jest.fn(),
      ...overrides,
    }) as jest.Mocked<ImageStoragePort>;

  const workWithImage: Work = {
    id: 'work-1',
    slug: 'work-slug',
    title: 'Work title',
    description: 'Work description',
    category: 'bancos',
    tags: [],
    images: [
      {
        id: 'image-1',
        url: 'https://cdn.example.com/image.png',
        publicId: 'carshop/works/work-1/image-1',
        alt: 'Descrição',
        isCover: true,
        order: 0,
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-01T00:00:00.000Z',
      },
    ],
    status: 'draft',
    deletedAt: null,
    createdAt: '2024-01-01T00:00:00.000Z',
    updatedAt: '2024-01-01T00:00:00.000Z',
  };

  const calls: string[] = [];

  beforeEach(() => {
    jest.clearAllMocks();
    calls.length = 0;
  });

  it('remove a imagem do storage externo e do Mongo (AC-004, FR-005)', async () => {
    const workRepository = buildWorkRepository({
      findById: jest.fn().mockResolvedValue(workWithImage),
      removeImage: jest.fn().mockImplementation(async () => {
        calls.push('removeImage');
      }),
    });
    const imageStorage = buildImageStorage({
      delete: jest.fn().mockImplementation(async () => {
        calls.push('delete');
      }),
    });

    const useCase = new DeleteWorkImageUseCase(workRepository, imageStorage);

    const result = await useCase.execute({
      workId: 'work-1',
      imageId: 'image-1',
    });

    expect(result).toEqual({ success: true });
    expect(imageStorage.delete).toHaveBeenCalledWith(
      'carshop/works/work-1/image-1',
    );
    expect(workRepository.removeImage).toHaveBeenCalledWith(
      'work-1',
      'image-1',
    );
    expect(calls).toEqual(['delete', 'removeImage']);
  });

  it('retorna 404 quando o work não existe', async () => {
    const workRepository = buildWorkRepository({
      findById: jest.fn().mockResolvedValue(undefined),
    });
    const imageStorage = buildImageStorage();

    const useCase = new DeleteWorkImageUseCase(workRepository, imageStorage);

    await expect(
      useCase.execute({ workId: 'missing-work', imageId: 'image-1' }),
    ).rejects.toMatchObject({ statusCode: 404 });

    expect(imageStorage.delete).not.toHaveBeenCalled();
    expect(workRepository.removeImage).not.toHaveBeenCalled();
  });

  it('retorna 404 quando a imagem não existe no work', async () => {
    const workRepository = buildWorkRepository({
      findById: jest.fn().mockResolvedValue(workWithImage),
    });
    const imageStorage = buildImageStorage();

    const useCase = new DeleteWorkImageUseCase(workRepository, imageStorage);

    await expect(
      useCase.execute({ workId: 'work-1', imageId: 'missing-image' }),
    ).rejects.toMatchObject({ statusCode: 404 });

    expect(imageStorage.delete).not.toHaveBeenCalled();
    expect(workRepository.removeImage).not.toHaveBeenCalled();
  });
});
