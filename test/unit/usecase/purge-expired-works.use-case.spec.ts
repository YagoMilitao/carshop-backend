import { PurgeExpiredWorksUseCase } from '../../../src/usecase/purge-expired-works.use-case';
import { HardDeleteWorkUseCase } from '../../../src/usecase/hard-delete-work.use-case';
import { HttpError } from '../../../src/core/domain/application/ApplicationError/http-error';
import type { WorkRepositoryPort } from '../../../src/core/domain/repositories/work.repository';
import type { Work } from '../../../src/core/domain/application/Work/work.types';

describe('PurgeExpiredWorksUseCase', () => {
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

  const buildHardDeleteWorkUseCase = (): jest.Mocked<HardDeleteWorkUseCase> =>
    ({
      execute: jest.fn(),
    }) as unknown as jest.Mocked<HardDeleteWorkUseCase>;

  const buildCandidate = (id: string, deletedAt: string): Work => ({
    id,
    slug: `work-${id}`,
    title: `Work ${id}`,
    description: 'Descrição',
    category: 'bancos',
    tags: [],
    images: [],
    status: 'published',
    deletedAt,
    createdAt: '2023-01-01T00:00:00.000Z',
    updatedAt: '2023-01-01T00:00:00.000Z',
  });

  let consoleLogSpy: jest.SpyInstance;
  let consoleErrorSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    consoleLogSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
    consoleErrorSpy.mockRestore();
  });

  it('remove definitivamente todos os candidatos e retorna a contagem correspondente (AC-001, AC-002, AC-003, FR-002, FR-003, FR-004)', async () => {
    const candidates = [
      buildCandidate('work-1', '2023-01-01T00:00:00.000Z'),
      buildCandidate('work-2', '2023-01-02T00:00:00.000Z'),
      buildCandidate('work-3', '2023-01-03T00:00:00.000Z'),
    ];
    const workRepository = buildWorkRepository({
      listDeletedBefore: jest.fn().mockResolvedValue(candidates),
    });
    const hardDeleteWorkUseCase = buildHardDeleteWorkUseCase();
    hardDeleteWorkUseCase.execute.mockResolvedValue({ success: true });

    const useCase = new PurgeExpiredWorksUseCase(
      workRepository,
      hardDeleteWorkUseCase,
    );

    const result = await useCase.execute(90);

    expect(result).toEqual({ removedWorksCount: 3 });
    expect(hardDeleteWorkUseCase.execute).toHaveBeenCalledTimes(3);
    expect(hardDeleteWorkUseCase.execute).toHaveBeenNthCalledWith(1, 'work-1');
    expect(hardDeleteWorkUseCase.execute).toHaveBeenNthCalledWith(2, 'work-2');
    expect(hardDeleteWorkUseCase.execute).toHaveBeenNthCalledWith(3, 'work-3');
    expect(consoleLogSpy).toHaveBeenCalled();
  });

  it('quando não há candidatos, não invoca o hard delete, retorna zero e loga o resultado (AC-007, FR-009)', async () => {
    const workRepository = buildWorkRepository({
      listDeletedBefore: jest.fn().mockResolvedValue([]),
    });
    const hardDeleteWorkUseCase = buildHardDeleteWorkUseCase();

    const useCase = new PurgeExpiredWorksUseCase(
      workRepository,
      hardDeleteWorkUseCase,
    );

    const result = await useCase.execute(90);

    expect(result).toEqual({ removedWorksCount: 0 });
    expect(hardDeleteWorkUseCase.execute).not.toHaveBeenCalled();
    expect(consoleLogSpy).toHaveBeenCalledWith(
      expect.stringContaining('0 removido(s)'),
    );
  });

  it('computa cutoffDate a partir de referenceDate e retentionDays e o repassa ao repositório (AC-006, AC-009, AC-010)', async () => {
    const referenceDate = new Date('2024-06-15T12:00:00.000Z');
    const retentionDays = 90;
    const expectedCutoffDate = new Date(
      referenceDate.getTime() - retentionDays * 24 * 60 * 60 * 1000,
    );

    const workRepository = buildWorkRepository({
      listDeletedBefore: jest.fn().mockResolvedValue([]),
    });
    const hardDeleteWorkUseCase = buildHardDeleteWorkUseCase();

    const useCase = new PurgeExpiredWorksUseCase(
      workRepository,
      hardDeleteWorkUseCase,
    );

    await useCase.execute(retentionDays, referenceDate);

    expect(workRepository.listDeletedBefore).toHaveBeenCalledWith(
      expectedCutoffDate,
    );
  });

  it.each([0, -5, 1.5])(
    'rejeita retentionDays inválido (%p)',
    async (retentionDays) => {
      const workRepository = buildWorkRepository();
      const hardDeleteWorkUseCase = buildHardDeleteWorkUseCase();

      const useCase = new PurgeExpiredWorksUseCase(
        workRepository,
        hardDeleteWorkUseCase,
      );

      await expect(useCase.execute(retentionDays)).rejects.toThrow();
      expect(workRepository.listDeletedBefore).not.toHaveBeenCalled();
    },
  );

  it('pula silenciosamente candidatos já removidos (HttpError 404), sem contá-los e sem lançar (NFR-002, AC-011)', async () => {
    const candidates = [
      buildCandidate('work-1', '2023-01-01T00:00:00.000Z'),
      buildCandidate('work-2', '2023-01-02T00:00:00.000Z'),
    ];
    const workRepository = buildWorkRepository({
      listDeletedBefore: jest.fn().mockResolvedValue(candidates),
    });
    const hardDeleteWorkUseCase = buildHardDeleteWorkUseCase();
    hardDeleteWorkUseCase.execute
      .mockRejectedValueOnce(new HttpError(404, 'Trabalho não encontrado.'))
      .mockResolvedValueOnce({ success: true });

    const useCase = new PurgeExpiredWorksUseCase(
      workRepository,
      hardDeleteWorkUseCase,
    );

    const result = await expect(useCase.execute(90)).resolves.toEqual({
      removedWorksCount: 1,
    });

    expect(hardDeleteWorkUseCase.execute).toHaveBeenCalledTimes(2);
    expect(consoleErrorSpy).not.toHaveBeenCalled();
    return result;
  });

  it('registra falhas não relacionadas a 404, não conta o item e continua processando os demais candidatos', async () => {
    const candidates = [
      buildCandidate('work-1', '2023-01-01T00:00:00.000Z'),
      buildCandidate('work-2', '2023-01-02T00:00:00.000Z'),
      buildCandidate('work-3', '2023-01-03T00:00:00.000Z'),
    ];
    const workRepository = buildWorkRepository({
      listDeletedBefore: jest.fn().mockResolvedValue(candidates),
    });
    const hardDeleteWorkUseCase = buildHardDeleteWorkUseCase();
    hardDeleteWorkUseCase.execute
      .mockResolvedValueOnce({ success: true })
      .mockRejectedValueOnce(
        new HttpError(
          502,
          'Falha ao remover arquivos do armazenamento externo. Tente novamente.',
        ),
      )
      .mockResolvedValueOnce({ success: true });

    const useCase = new PurgeExpiredWorksUseCase(
      workRepository,
      hardDeleteWorkUseCase,
    );

    const result = await useCase.execute(90);

    expect(result).toEqual({ removedWorksCount: 2 });
    expect(hardDeleteWorkUseCase.execute).toHaveBeenCalledTimes(3);
    expect(hardDeleteWorkUseCase.execute).toHaveBeenNthCalledWith(3, 'work-3');
    expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      expect.any(String),
      expect.stringContaining('Falha ao remover arquivos'),
    );
  });
});
