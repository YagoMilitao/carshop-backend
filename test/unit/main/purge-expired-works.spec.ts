import {
  expect,
  describe,
  it,
  beforeEach,
  afterEach,
  afterAll,
  jest,
} from '@jest/globals';

describe('purge-expired-works script (FR-010, AC-012)', () => {
  const originalEnv = process.env;

  const waitFor = (predicate: () => boolean, attempts = 50): Promise<void> =>
    new Promise((resolve, reject) => {
      const check = (remaining: number): void => {
        if (predicate()) {
          resolve();
          return;
        }
        if (remaining <= 0) {
          reject(new Error('Timed out waiting for condition.'));
          return;
        }
        setImmediate(() => check(remaining - 1));
      };
      check(attempts);
    });

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('conecta, executa a rotina com o retentionDays do env, loga o resultado e sempre desconecta (happy path)', async () => {
    const connectDatabaseMock = jest.fn<(uri: string) => Promise<void>>(() =>
      Promise.resolve(),
    );
    const disconnectDatabaseMock = jest.fn<() => Promise<void>>(() =>
      Promise.resolve(),
    );
    const executeMock = jest.fn<
      (retentionDays: number) => Promise<{ removedWorksCount: number }>
    >(() => Promise.resolve({ removedWorksCount: 4 }));
    const workRepositoryCtor = jest.fn().mockImplementation(() => ({}));
    const imageStorageCtor = jest.fn().mockImplementation(() => ({}));
    const hardDeleteWorkUseCaseCtor = jest.fn().mockImplementation(() => ({}));
    const purgeExpiredWorksUseCaseCtor = jest.fn().mockImplementation(() => ({
      execute: executeMock,
    }));

    const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

    jest.doMock('../../../src/infra/config/env', () => ({
      env: { mongoUri: 'mongodb://unit-test', workHardDeleteAfterDays: 45 },
    }));
    jest.doMock('../../../src/infra/database/mongoose', () => ({
      connectDatabase: connectDatabaseMock,
      disconnectDatabase: disconnectDatabaseMock,
    }));
    jest.doMock(
      '../../../src/infra/repositories/mongo-work.repository',
      () => ({
        MongoWorkRepository: workRepositoryCtor,
      }),
    );
    jest.doMock(
      '../../../src/infra/gateway/cloudinary/cloudinary-storage.service',
      () => ({
        CloudinaryStorageService: imageStorageCtor,
      }),
    );
    jest.doMock('../../../src/usecase/hard-delete-work.use-case', () => ({
      HardDeleteWorkUseCase: hardDeleteWorkUseCaseCtor,
    }));
    jest.doMock('../../../src/usecase/purge-expired-works.use-case', () => ({
      PurgeExpiredWorksUseCase: purgeExpiredWorksUseCaseCtor,
    }));

    jest.isolateModules(() => {
      require('../../../src/main/purge-expired-works');
    });

    await waitFor(() => disconnectDatabaseMock.mock.calls.length > 0);

    expect(connectDatabaseMock).toHaveBeenCalledWith('mongodb://unit-test');
    expect(workRepositoryCtor).toHaveBeenCalledTimes(1);
    expect(imageStorageCtor).toHaveBeenCalledTimes(1);
    expect(hardDeleteWorkUseCaseCtor).toHaveBeenCalledTimes(1);
    expect(purgeExpiredWorksUseCaseCtor).toHaveBeenCalledTimes(1);
    expect(executeMock).toHaveBeenCalledWith(45);
    expect(logSpy).toHaveBeenCalledWith(
      expect.stringContaining('Works removidos definitivamente: 4'),
    );
    expect(errorSpy).not.toHaveBeenCalled();
    expect(disconnectDatabaseMock).toHaveBeenCalledTimes(1);
  });

  it('em caso de erro, loga a falha de forma segura, marca exitCode = 1 e ainda assim desconecta', async () => {
    const connectDatabaseMock = jest.fn<(uri: string) => Promise<void>>(() =>
      Promise.reject(new Error('connection refused')),
    );
    const disconnectDatabaseMock = jest.fn<() => Promise<void>>(() =>
      Promise.resolve(),
    );
    const workRepositoryCtor = jest.fn().mockImplementation(() => ({}));
    const imageStorageCtor = jest.fn().mockImplementation(() => ({}));
    const hardDeleteWorkUseCaseCtor = jest.fn().mockImplementation(() => ({}));
    const purgeExpiredWorksUseCaseCtor = jest.fn().mockImplementation(() => ({
      execute: jest.fn(),
    }));

    const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

    const originalExitCode = process.exitCode;
    process.exitCode = undefined;

    jest.doMock('../../../src/infra/config/env', () => ({
      env: { mongoUri: 'mongodb://unit-test', workHardDeleteAfterDays: 45 },
    }));
    jest.doMock('../../../src/infra/database/mongoose', () => ({
      connectDatabase: connectDatabaseMock,
      disconnectDatabase: disconnectDatabaseMock,
    }));
    jest.doMock(
      '../../../src/infra/repositories/mongo-work.repository',
      () => ({
        MongoWorkRepository: workRepositoryCtor,
      }),
    );
    jest.doMock(
      '../../../src/infra/gateway/cloudinary/cloudinary-storage.service',
      () => ({
        CloudinaryStorageService: imageStorageCtor,
      }),
    );
    jest.doMock('../../../src/usecase/hard-delete-work.use-case', () => ({
      HardDeleteWorkUseCase: hardDeleteWorkUseCaseCtor,
    }));
    jest.doMock('../../../src/usecase/purge-expired-works.use-case', () => ({
      PurgeExpiredWorksUseCase: purgeExpiredWorksUseCaseCtor,
    }));

    jest.isolateModules(() => {
      require('../../../src/main/purge-expired-works');
    });

    await waitFor(() => disconnectDatabaseMock.mock.calls.length > 0);

    expect(errorSpy).toHaveBeenCalledWith(
      'Erro ao executar a rotina de expurgo de works.',
      'connection refused',
    );
    expect(process.exitCode).toBe(1);
    expect(disconnectDatabaseMock).toHaveBeenCalledTimes(1);
    expect(logSpy).not.toHaveBeenCalledWith(
      expect.stringContaining('Works removidos definitivamente'),
    );

    process.exitCode = originalExitCode;
  });
});
