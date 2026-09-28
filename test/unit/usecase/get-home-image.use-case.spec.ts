import { GetHomeImageUseCase } from '../../../src/usecase/get-home-image.use-case';
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

const CONFIGURED_SELECTION = {
  workId: 'work-1',
  imageId: 'image-1',
  updatedAt: '2024-01-02T00:00:00.000Z',
};

function buildSettingsRepository(
  options: { configured: boolean } = { configured: true },
): jest.Mocked<HomeImageSettingsRepositoryPort> {
  return {
    find: jest
      .fn()
      .mockResolvedValue(options.configured ? CONFIGURED_SELECTION : undefined),
    save: jest.fn(),
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
        id: 'image-1',
        url: 'https://cdn.example.com/hero.jpg',
        publicId: 'carshop/works/work-1/image-1',
        alt: 'Banco reformado',
        isCover: true,
        order: 0,
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
 * CARSHOP-159 — FR-003/FR-004/FR-008/FR-009 (AD-002..AD-004):
 * read-time resolution of the configured Home image.
 */
describe('GetHomeImageUseCase (CARSHOP-159)', () => {
  it('returns null when nothing is configured, without looking up works (AC-002)', async () => {
    const workRepository = buildWorkRepository();
    const settingsRepository = buildSettingsRepository({ configured: false });
    const useCase = new GetHomeImageUseCase(workRepository, settingsRepository);

    await expect(useCase.execute()).resolves.toBeNull();
    expect(workRepository.findById).not.toHaveBeenCalled();
  });

  it('returns the configured image resolved from the current work (AC-001)', async () => {
    const workRepository = buildWorkRepository();
    const settingsRepository = buildSettingsRepository();
    workRepository.findById.mockResolvedValue(buildWork());
    const useCase = new GetHomeImageUseCase(workRepository, settingsRepository);

    const homeImage = await useCase.execute();

    expect(workRepository.findById).toHaveBeenCalledWith('work-1');
    expect(homeImage).toEqual({
      workId: 'work-1',
      imageId: 'image-1',
      url: 'https://cdn.example.com/hero.jpg',
      alt: 'Banco reformado',
    });
    expect(homeImage).not.toHaveProperty('publicId');
  });

  it('reflects the current url/alt of the work image rather than a stored copy', async () => {
    const workRepository = buildWorkRepository();
    const settingsRepository = buildSettingsRepository();
    const work = buildWork();
    work.images[0] = {
      ...work.images[0],
      url: 'https://cdn.example.com/updated.jpg',
      alt: 'Texto atualizado',
    };
    workRepository.findById.mockResolvedValue(work);
    const useCase = new GetHomeImageUseCase(workRepository, settingsRepository);

    await expect(useCase.execute()).resolves.toMatchObject({
      url: 'https://cdn.example.com/updated.jpg',
      alt: 'Texto atualizado',
    });
  });

  it('returns null when the work was permanently or logically removed (AC-010, AC-011)', async () => {
    const workRepository = buildWorkRepository();
    const settingsRepository = buildSettingsRepository();
    workRepository.findById.mockResolvedValue(undefined);
    const useCase = new GetHomeImageUseCase(workRepository, settingsRepository);

    await expect(useCase.execute()).resolves.toBeNull();
  });

  it('returns null when the work carries a deletedAt timestamp (AC-011)', async () => {
    const workRepository = buildWorkRepository();
    const settingsRepository = buildSettingsRepository();
    workRepository.findById.mockResolvedValue(
      buildWork({ deletedAt: '2024-03-01T00:00:00.000Z' }),
    );
    const useCase = new GetHomeImageUseCase(workRepository, settingsRepository);

    await expect(useCase.execute()).resolves.toBeNull();
  });

  it('returns null when the configured image was removed from the work (AC-010)', async () => {
    const workRepository = buildWorkRepository();
    const settingsRepository = buildSettingsRepository();
    workRepository.findById.mockResolvedValue(buildWork({ images: [] }));
    const useCase = new GetHomeImageUseCase(workRepository, settingsRepository);

    await expect(useCase.execute()).resolves.toBeNull();
  });

  it('returns null when the work became a draft (AC-011)', async () => {
    const workRepository = buildWorkRepository();
    const settingsRepository = buildSettingsRepository();
    workRepository.findById.mockResolvedValue(buildWork({ status: 'draft' }));
    const useCase = new GetHomeImageUseCase(workRepository, settingsRepository);

    await expect(useCase.execute()).resolves.toBeNull();
  });

  it('treats a stored identifier rejected by the repository with 400 as no configuration', async () => {
    const workRepository = buildWorkRepository();
    const settingsRepository = buildSettingsRepository();
    workRepository.findById.mockRejectedValue(
      new HttpError(400, 'id deve ser uma string válida.'),
    );
    const useCase = new GetHomeImageUseCase(workRepository, settingsRepository);

    await expect(useCase.execute()).resolves.toBeNull();
  });

  it.each([
    ['a non-400 HttpError', new HttpError(500, 'Falha.')],
    ['a generic error', new Error('connection lost')],
  ])('propagates %s from the work lookup', async (_label, error) => {
    const workRepository = buildWorkRepository();
    const settingsRepository = buildSettingsRepository();
    workRepository.findById.mockRejectedValue(error);
    const useCase = new GetHomeImageUseCase(workRepository, settingsRepository);

    await expect(useCase.execute()).rejects.toBe(error);
  });

  it('never writes to the settings repository on read', async () => {
    const workRepository = buildWorkRepository();
    const settingsRepository = buildSettingsRepository();
    workRepository.findById.mockResolvedValue(undefined);
    const useCase = new GetHomeImageUseCase(workRepository, settingsRepository);

    await useCase.execute();

    expect(settingsRepository.save).not.toHaveBeenCalled();
  });
});
