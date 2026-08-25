jest.mock('crypto', () => ({
  randomUUID: jest.fn(() => 'image-uuid-1'),
}));

const mockReadFile = jest.fn();
const mockUnlink = jest.fn();

jest.mock('fs', () => ({
  promises: {
    readFile: (...args: unknown[]) =>
      (mockReadFile as unknown as (...a: unknown[]) => unknown)(...args),
    unlink: (...args: unknown[]) =>
      (mockUnlink as unknown as (...a: unknown[]) => unknown)(...args),
  },
}));

import { UploadWorkImageUseCase } from '../../../src/usecase/upload-work-image.use-case';
import { HttpError } from '../../../src/core/domain/application/ApplicationError/http-error';
import type { WorkRepositoryPort } from '../../../src/core/domain/repositories/work.repository';
import type { ImageStoragePort } from '../../../src/core/domain/application/Storage/image-storage.port';
import type { Work } from '../../../src/core/domain/application/Work/work.types';

describe('UploadWorkImageUseCase', () => {
  const baseWork: Work = {
    id: 'work-1',
    slug: 'work-slug',
    title: 'Work title',
    description: 'Work description',
    category: 'bancos',
    tags: [],
    images: [],
    status: 'draft',
    deletedAt: null,
    createdAt: '2024-01-01T00:00:00.000Z',
    updatedAt: '2024-01-01T00:00:00.000Z',
  };

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

  const input = {
    workId: 'work-1',
    filePath: '/tmp/uploads/file.png',
    mimeType: 'image/png',
    originalName: 'photo.png',
    alt: 'Descrição da imagem',
    isCover: true,
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockReadFile.mockResolvedValue(Buffer.from('binary-content'));
    mockUnlink.mockResolvedValue(undefined);
  });

  it('faz upload da imagem para o storage externo e persiste metadados no Mongo (AC-001, AC-002)', async () => {
    const workRepository = buildWorkRepository({
      findById: jest.fn().mockResolvedValue(baseWork),
      addImage: jest.fn().mockResolvedValue(baseWork),
    });
    const imageStorage = buildImageStorage({
      upload: jest.fn().mockResolvedValue({
        url: 'https://cdn.example.com/image.png',
        publicId: 'carshop/works/work-1/image-uuid-1',
      }),
    });

    const useCase = new UploadWorkImageUseCase(workRepository, imageStorage);

    await useCase.execute(input);

    expect(mockReadFile).toHaveBeenCalledWith(input.filePath);
    expect(imageStorage.upload).toHaveBeenCalledWith({
      buffer: Buffer.from('binary-content'),
      mimeType: input.mimeType,
      originalName: input.originalName,
      folder: 'carshop/works/work-1',
    });
    expect(workRepository.addImage).toHaveBeenCalledWith(
      'work-1',
      expect.objectContaining({
        id: 'image-uuid-1',
        url: 'https://cdn.example.com/image.png',
        publicId: 'carshop/works/work-1/image-uuid-1',
        alt: input.alt,
        isCover: true,
        order: 0,
      }),
    );

    const persistedImage = workRepository.addImage.mock.calls[0][1];
    expect(persistedImage).not.toHaveProperty('buffer');
    expect(persistedImage).not.toHaveProperty('filePath');

    expect(mockUnlink).toHaveBeenCalledWith(input.filePath);
  });

  it('retorna 404 quando o work não existe e não faz upload', async () => {
    const workRepository = buildWorkRepository({
      findById: jest.fn().mockResolvedValue(undefined),
    });
    const imageStorage = buildImageStorage();

    const useCase = new UploadWorkImageUseCase(workRepository, imageStorage);

    await expect(useCase.execute(input)).rejects.toMatchObject({
      statusCode: 404,
    });

    expect(imageStorage.upload).not.toHaveBeenCalled();
    expect(workRepository.addImage).not.toHaveBeenCalled();
    expect(mockUnlink).toHaveBeenCalledWith(input.filePath);
  });

  it('não persiste metadados no Mongo quando o upload ao storage externo falha (FR-003, AC-003)', async () => {
    const workRepository = buildWorkRepository({
      findById: jest.fn().mockResolvedValue(baseWork),
    });
    const imageStorage = buildImageStorage({
      upload: jest.fn().mockRejectedValue(new Error('cloudinary offline')),
    });

    const useCase = new UploadWorkImageUseCase(workRepository, imageStorage);

    await expect(useCase.execute(input)).rejects.toThrow('cloudinary offline');

    expect(workRepository.addImage).not.toHaveBeenCalled();
    expect(mockUnlink).toHaveBeenCalledWith(input.filePath);
  });

  it('compensa o upload remoto quando a persistência no Mongo falha após upload bem-sucedido (FR-004, NFR-002)', async () => {
    const workRepository = buildWorkRepository({
      findById: jest.fn().mockResolvedValue(baseWork),
      addImage: jest.fn().mockRejectedValue(new Error('mongo down')),
    });
    const imageStorage = buildImageStorage({
      upload: jest.fn().mockResolvedValue({
        url: 'https://cdn.example.com/image.png',
        publicId: 'carshop/works/work-1/image-uuid-1',
      }),
      delete: jest.fn().mockResolvedValue(undefined),
    });

    const useCase = new UploadWorkImageUseCase(workRepository, imageStorage);

    let capturedError: unknown;
    try {
      await useCase.execute(input);
    } catch (error) {
      capturedError = error;
    }

    expect(capturedError).toBeInstanceOf(HttpError);
    expect(capturedError).toMatchObject({ statusCode: 500 });
    expect(imageStorage.delete).toHaveBeenCalledWith(
      'carshop/works/work-1/image-uuid-1',
    );
    expect(mockUnlink).toHaveBeenCalledWith(input.filePath);
  });

  it('propaga o erro original mesmo se a compensação de exclusão remota também falhar', async () => {
    const workRepository = buildWorkRepository({
      findById: jest.fn().mockResolvedValue(baseWork),
      addImage: jest.fn().mockRejectedValue(new Error('mongo down')),
    });
    const imageStorage = buildImageStorage({
      upload: jest.fn().mockResolvedValue({
        url: 'https://cdn.example.com/image.png',
        publicId: 'carshop/works/work-1/image-uuid-1',
      }),
      delete: jest.fn().mockRejectedValue(new Error('cloudinary unreachable')),
    });

    const useCase = new UploadWorkImageUseCase(workRepository, imageStorage);

    await expect(useCase.execute(input)).rejects.toMatchObject({
      statusCode: 500,
    });

    expect(mockUnlink).toHaveBeenCalledWith(input.filePath);
  });

  it('limpa o arquivo temporário mesmo quando a leitura do arquivo falha', async () => {
    const workRepository = buildWorkRepository({
      findById: jest.fn().mockResolvedValue(baseWork),
    });
    const imageStorage = buildImageStorage();

    mockReadFile.mockRejectedValue(new Error('permission denied'));

    const useCase = new UploadWorkImageUseCase(workRepository, imageStorage);

    await expect(useCase.execute(input)).rejects.toThrow('permission denied');

    expect(imageStorage.upload).not.toHaveBeenCalled();
    expect(mockUnlink).toHaveBeenCalledWith(input.filePath);
  });
});
