import { HardDeleteWorkUseCase } from '../../../src/usecase/hard-delete-work.use-case';
import { HttpError } from '../../../src/core/domain/application/ApplicationError/http-error';
import type { WorkRepositoryPort } from '../../../src/core/domain/repositories/work.repository';
import type { ImageStoragePort } from '../../../src/core/domain/application/Storage/image-storage.port';
import type { Work } from '../../../src/core/domain/application/Work/work.types';

describe('HardDeleteWorkUseCase', () => {
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

  const buildImage = (id: string) => ({
    id,
    url: `https://cdn.example.com/${id}.png`,
    publicId: `carshop/works/work-1/${id}`,
    alt: 'Descrição',
    isCover: false,
    order: 0,
    createdAt: '2024-01-01T00:00:00.000Z',
    updatedAt: '2024-01-01T00:00:00.000Z',
  });

  const workWithImages: Work = {
    id: 'work-1',
    slug: 'work-slug',
    title: 'Work title',
    description: 'Work description',
    category: 'bancos',
    tags: [],
    images: [buildImage('image-1'), buildImage('image-2')],
    status: 'draft',
    deletedAt: null,
    createdAt: '2024-01-01T00:00:00.000Z',
    updatedAt: '2024-01-01T00:00:00.000Z',
  };

  let consoleErrorSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
  });

  it('remove todas as imagens do storage externo e então faz o hard delete no Mongo (AC-005, FR-006)', async () => {
    const workRepository = buildWorkRepository({
      findByIdIncludingDeleted: jest.fn().mockResolvedValue(workWithImages),
    });
    const imageStorage = buildImageStorage({
      delete: jest.fn().mockResolvedValue(undefined),
    });

    const useCase = new HardDeleteWorkUseCase(workRepository, imageStorage);

    const result = await useCase.execute('work-1');

    expect(result).toEqual({ success: true });
    expect(imageStorage.delete).toHaveBeenCalledTimes(2);
    expect(imageStorage.delete).toHaveBeenNthCalledWith(
      1,
      'carshop/works/work-1/image-1',
    );
    expect(imageStorage.delete).toHaveBeenNthCalledWith(
      2,
      'carshop/works/work-1/image-2',
    );
    expect(workRepository.hardDelete).toHaveBeenCalledWith('work-1');
  });

  it('retorna 404 quando o work não existe e nunca chama hardDelete', async () => {
    const workRepository = buildWorkRepository({
      findByIdIncludingDeleted: jest.fn().mockResolvedValue(undefined),
    });
    const imageStorage = buildImageStorage();

    const useCase = new HardDeleteWorkUseCase(workRepository, imageStorage);

    await expect(useCase.execute('missing-work')).rejects.toMatchObject({
      statusCode: 404,
    });

    expect(imageStorage.delete).not.toHaveBeenCalled();
    expect(workRepository.hardDelete).not.toHaveBeenCalled();
    expect(workRepository.hardDeleteData).not.toHaveBeenCalled();
  });

  it('aborta antes de tocar no Mongo quando a exclusão no storage externo falha de fato (502)', async () => {
    const workRepository = buildWorkRepository({
      findByIdIncludingDeleted: jest.fn().mockResolvedValue(workWithImages),
    });
    const imageStorage = buildImageStorage({
      delete: jest.fn().mockRejectedValue(new Error('cloudinary unreachable')),
    });

    const useCase = new HardDeleteWorkUseCase(workRepository, imageStorage);

    await expect(useCase.execute('work-1')).rejects.toBeInstanceOf(HttpError);
    await expect(useCase.execute('work-1')).rejects.toMatchObject({
      statusCode: 502,
    });

    expect(workRepository.hardDelete).not.toHaveBeenCalled();
    expect(workRepository.hardDeleteData).not.toHaveBeenCalled();
  });

  it('nunca utiliza hardDeleteData (que não remove comentários) para o hard delete', async () => {
    const workRepository = buildWorkRepository({
      findByIdIncludingDeleted: jest
        .fn()
        .mockResolvedValue({ ...workWithImages, images: [] }),
    });
    const imageStorage = buildImageStorage();

    const useCase = new HardDeleteWorkUseCase(workRepository, imageStorage);

    await useCase.execute('work-1');

    expect(workRepository.hardDelete).toHaveBeenCalledWith('work-1');
    expect(workRepository.hardDeleteData).not.toHaveBeenCalled();
  });
});
