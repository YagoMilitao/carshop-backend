import { SetHomeImageUseCase } from '../../../src/usecase/set-home-image.use-case';
import { HttpError } from '../../../src/core/domain/application/ApplicationError/http-error';
import type { WorkRepositoryPort } from '../../../src/core/domain/repositories/work.repository';
import type { HomeImageSettingsRepositoryPort } from '../../../src/core/domain/repositories/home-image-settings.repository';
import type { Work } from '../../../src/core/domain/application/Work/work.types';

function buildWorkRepository(): jest.Mocked<WorkRepositoryPort> {
  return {
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
  };
}

function buildSettingsRepository(): jest.Mocked<HomeImageSettingsRepositoryPort> {
  return {
    find: jest.fn(),
    save: jest.fn().mockResolvedValue({
      workId: 'work-1',
      imageId: 'image-1',
      updatedAt: '2024-01-02T00:00:00.000Z',
    }),
  };
}

function buildWork(overrides: Partial<Work> = {}): Work {
  return {
    id: 'work-1',
    slug: 'work-slug',
    title: 'Work title',
    description: 'Work description',
    category: 'bancos',
    tags: [],
    images: [
      {
        id: 'image-0',
        url: 'https://cdn.example.com/other.jpg',
        publicId: 'carshop/works/work-1/image-0',
        alt: 'Outra imagem',
        isCover: true,
        order: 0,
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-01T00:00:00.000Z',
      },
      {
        id: 'image-1',
        url: 'https://cdn.example.com/hero.jpg',
        publicId: 'carshop/works/work-1/image-1',
        alt: 'Banco reformado',
        isCover: false,
        order: 1,
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-01T00:00:00.000Z',
      },
    ],
    status: 'published',
    deletedAt: null,
    createdAt: '2024-01-01T00:00:00.000Z',
    updatedAt: '2024-01-01T00:00:00.000Z',
    ...overrides,
  };
}

/**
 * CARSHOP-159 — FR-005/FR-006/FR-009, AC-003/AC-005/AC-006/AC-012.
 */
describe('SetHomeImageUseCase (CARSHOP-159)', () => {
  it('persists the reference of an eligible image and returns url/alt from the work (AC-003)', async () => {
    const workRepository = buildWorkRepository();
    const settingsRepository = buildSettingsRepository();
    workRepository.findById.mockResolvedValue(buildWork());
    const useCase = new SetHomeImageUseCase(workRepository, settingsRepository);

    const homeImage = await useCase.execute({
      workId: 'work-1',
      imageId: 'image-1',
    });

    expect(workRepository.findById).toHaveBeenCalledWith('work-1');
    expect(settingsRepository.save).toHaveBeenCalledTimes(1);
    expect(settingsRepository.save).toHaveBeenCalledWith({
      workId: 'work-1',
      imageId: 'image-1',
    });
    expect(homeImage).toEqual({
      workId: 'work-1',
      imageId: 'image-1',
      url: 'https://cdn.example.com/hero.jpg',
      alt: 'Banco reformado',
    });
  });

  it('never exposes the storage publicId in the result (AC-012)', async () => {
    const workRepository = buildWorkRepository();
    const settingsRepository = buildSettingsRepository();
    workRepository.findById.mockResolvedValue(buildWork());
    const useCase = new SetHomeImageUseCase(workRepository, settingsRepository);

    const homeImage = await useCase.execute({
      workId: 'work-1',
      imageId: 'image-1',
    });

    expect(homeImage).not.toHaveProperty('publicId');
    expect(JSON.stringify(homeImage)).not.toContain('carshop/works');
  });

  it('rejects a missing or soft-deleted work with 404 without saving (AC-005)', async () => {
    const workRepository = buildWorkRepository();
    const settingsRepository = buildSettingsRepository();
    workRepository.findById.mockResolvedValue(undefined);
    const useCase = new SetHomeImageUseCase(workRepository, settingsRepository);

    const result = useCase.execute({ workId: 'missing', imageId: 'image-1' });

    await expect(result).rejects.toBeInstanceOf(HttpError);
    await expect(result).rejects.toMatchObject({
      statusCode: 404,
      message: 'Trabalho não encontrado.',
    });
    expect(settingsRepository.save).not.toHaveBeenCalled();
  });

  it('rejects an image that does not belong to the work with 404 without saving (AC-005)', async () => {
    const workRepository = buildWorkRepository();
    const settingsRepository = buildSettingsRepository();
    workRepository.findById.mockResolvedValue(buildWork());
    const useCase = new SetHomeImageUseCase(workRepository, settingsRepository);

    await expect(
      useCase.execute({ workId: 'work-1', imageId: 'unknown-image' }),
    ).rejects.toMatchObject({
      statusCode: 404,
      message: 'Imagem não encontrada.',
    });
    expect(settingsRepository.save).not.toHaveBeenCalled();
  });

  it('rejects an image of a draft work with 409 without saving (AC-006)', async () => {
    const workRepository = buildWorkRepository();
    const settingsRepository = buildSettingsRepository();
    workRepository.findById.mockResolvedValue(buildWork({ status: 'draft' }));
    const useCase = new SetHomeImageUseCase(workRepository, settingsRepository);

    await expect(
      useCase.execute({ workId: 'work-1', imageId: 'image-1' }),
    ).rejects.toMatchObject({
      statusCode: 409,
      message:
        'A imagem selecionada não é elegível: o trabalho não está publicado.',
    });
    expect(settingsRepository.save).not.toHaveBeenCalled();
  });

  it('propagates repository errors without saving', async () => {
    const workRepository = buildWorkRepository();
    const settingsRepository = buildSettingsRepository();
    const repositoryError = new HttpError(
      400,
      'id deve ser uma string válida.',
    );
    workRepository.findById.mockRejectedValue(repositoryError);
    const useCase = new SetHomeImageUseCase(workRepository, settingsRepository);

    await expect(
      useCase.execute({ workId: '$ne', imageId: 'image-1' }),
    ).rejects.toBe(repositoryError);
    expect(settingsRepository.save).not.toHaveBeenCalled();
  });

  it('propagates a persistence failure from save', async () => {
    const workRepository = buildWorkRepository();
    const settingsRepository = buildSettingsRepository();
    const saveError = new Error('write failed');
    workRepository.findById.mockResolvedValue(buildWork());
    settingsRepository.save.mockRejectedValue(saveError);
    const useCase = new SetHomeImageUseCase(workRepository, settingsRepository);

    await expect(
      useCase.execute({ workId: 'work-1', imageId: 'image-1' }),
    ).rejects.toBe(saveError);
  });
});
