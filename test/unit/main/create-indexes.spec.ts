import {
  expect,
  describe,
  it,
  beforeEach,
  afterEach,
  afterAll,
  jest,
} from '@jest/globals';

describe('create-indexes script (NFR-001)', () => {
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

  it('conecta, sincroniza os índices de Work/Category/Tag, loga sucesso e sempre desconecta (happy path)', async () => {
    const connectDatabaseMock = jest.fn<(uri: string) => Promise<void>>(() =>
      Promise.resolve(),
    );
    const disconnectDatabaseMock = jest.fn<() => Promise<void>>(() =>
      Promise.resolve(),
    );
    const workSyncIndexesMock = jest.fn<() => Promise<void>>(() =>
      Promise.resolve(),
    );
    const categorySyncIndexesMock = jest.fn<() => Promise<void>>(() =>
      Promise.resolve(),
    );
    const tagSyncIndexesMock = jest.fn<() => Promise<void>>(() =>
      Promise.resolve(),
    );

    const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

    const originalExitCode = process.exitCode;
    process.exitCode = undefined;

    jest.doMock('../../../src/infra/config/env', () => ({
      env: { mongoUri: 'mongodb://unit-test' },
    }));
    jest.doMock('../../../src/infra/database/mongoose', () => ({
      connectDatabase: connectDatabaseMock,
      disconnectDatabase: disconnectDatabaseMock,
    }));
    jest.doMock('../../../src/data/models/work.model', () => ({
      WorkModel: { syncIndexes: workSyncIndexesMock },
    }));
    jest.doMock('../../../src/data/models/category.model', () => ({
      CategoryModel: { syncIndexes: categorySyncIndexesMock },
    }));
    jest.doMock('../../../src/data/models/tag.model', () => ({
      TagModel: { syncIndexes: tagSyncIndexesMock },
    }));

    jest.isolateModules(() => {
      require('../../../src/main/create-indexes');
    });

    await waitFor(() => disconnectDatabaseMock.mock.calls.length > 0);

    expect(connectDatabaseMock).toHaveBeenCalledWith('mongodb://unit-test');
    expect(workSyncIndexesMock).toHaveBeenCalledTimes(1);
    expect(categorySyncIndexesMock).toHaveBeenCalledTimes(1);
    expect(tagSyncIndexesMock).toHaveBeenCalledTimes(1);
    expect(logSpy).toHaveBeenCalledWith('Índices sincronizados com sucesso.');
    expect(errorSpy).not.toHaveBeenCalled();
    expect(disconnectDatabaseMock).toHaveBeenCalledTimes(1);
    expect(process.exitCode).toBeUndefined();

    process.exitCode = originalExitCode;
  });

  it('em caso de falha na conexão, loga apenas a mensagem sanitizada, marca exitCode = 1 e ainda assim desconecta', async () => {
    const failure = new Error('connection refused');
    const connectDatabaseMock = jest.fn<(uri: string) => Promise<void>>(() =>
      Promise.reject(failure),
    );
    const disconnectDatabaseMock = jest.fn<() => Promise<void>>(() =>
      Promise.resolve(),
    );
    const workSyncIndexesMock = jest.fn<() => Promise<void>>(() =>
      Promise.resolve(),
    );
    const categorySyncIndexesMock = jest.fn<() => Promise<void>>(() =>
      Promise.resolve(),
    );
    const tagSyncIndexesMock = jest.fn<() => Promise<void>>(() =>
      Promise.resolve(),
    );

    const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

    const originalExitCode = process.exitCode;
    process.exitCode = undefined;

    jest.doMock('../../../src/infra/config/env', () => ({
      env: { mongoUri: 'mongodb://unit-test' },
    }));
    jest.doMock('../../../src/infra/database/mongoose', () => ({
      connectDatabase: connectDatabaseMock,
      disconnectDatabase: disconnectDatabaseMock,
    }));
    jest.doMock('../../../src/data/models/work.model', () => ({
      WorkModel: { syncIndexes: workSyncIndexesMock },
    }));
    jest.doMock('../../../src/data/models/category.model', () => ({
      CategoryModel: { syncIndexes: categorySyncIndexesMock },
    }));
    jest.doMock('../../../src/data/models/tag.model', () => ({
      TagModel: { syncIndexes: tagSyncIndexesMock },
    }));

    jest.isolateModules(() => {
      require('../../../src/main/create-indexes');
    });

    await waitFor(() => disconnectDatabaseMock.mock.calls.length > 0);

    expect(errorSpy).toHaveBeenCalledTimes(1);
    const [errorCallArgs] = errorSpy.mock.calls;
    expect(errorCallArgs).toEqual([
      'Erro ao sincronizar índices.',
      'connection refused',
    ]);
    // Guard against a regression that would leak the raw Error object,
    // its stack, or a `.cause` property to the console instead of only
    // the sanitized `.message` string.
    errorCallArgs.forEach((arg) => {
      expect(arg).not.toBeInstanceOf(Error);
    });
    expect(errorSpy).not.toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ cause: expect.anything() }),
    );

    expect(process.exitCode).toBe(1);
    expect(workSyncIndexesMock).not.toHaveBeenCalled();
    expect(disconnectDatabaseMock).toHaveBeenCalledTimes(1);
    expect(logSpy).not.toHaveBeenCalledWith(
      'Índices sincronizados com sucesso.',
    );

    process.exitCode = originalExitCode;
  });

  it('não vaza credenciais de conexão quando a falha embute uma connection string na mensagem de erro (NFR-001)', async () => {
    const fakeConnectionStringError = new Error(
      'connect ECONNREFUSED to mongodb://fake-test-user:fake-test-pass@localhost:27017',
    );
    (fakeConnectionStringError as Error & { cause?: unknown }).cause = {
      uri: 'mongodb://fake-test-user:fake-test-pass@localhost:27017',
    };

    const connectDatabaseMock = jest.fn<(uri: string) => Promise<void>>(() =>
      Promise.reject(fakeConnectionStringError),
    );
    const disconnectDatabaseMock = jest.fn<() => Promise<void>>(() =>
      Promise.resolve(),
    );
    const workSyncIndexesMock = jest.fn<() => Promise<void>>(() =>
      Promise.resolve(),
    );
    const categorySyncIndexesMock = jest.fn<() => Promise<void>>(() =>
      Promise.resolve(),
    );
    const tagSyncIndexesMock = jest.fn<() => Promise<void>>(() =>
      Promise.resolve(),
    );

    const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

    const originalExitCode = process.exitCode;
    process.exitCode = undefined;

    jest.doMock('../../../src/infra/config/env', () => ({
      env: { mongoUri: 'mongodb://unit-test' },
    }));
    jest.doMock('../../../src/infra/database/mongoose', () => ({
      connectDatabase: connectDatabaseMock,
      disconnectDatabase: disconnectDatabaseMock,
    }));
    jest.doMock('../../../src/data/models/work.model', () => ({
      WorkModel: { syncIndexes: workSyncIndexesMock },
    }));
    jest.doMock('../../../src/data/models/category.model', () => ({
      CategoryModel: { syncIndexes: categorySyncIndexesMock },
    }));
    jest.doMock('../../../src/data/models/tag.model', () => ({
      TagModel: { syncIndexes: tagSyncIndexesMock },
    }));

    jest.isolateModules(() => {
      require('../../../src/main/create-indexes');
    });

    await waitFor(() => disconnectDatabaseMock.mock.calls.length > 0);

    // The current implementation logs error.message directly, which is the
    // accepted pattern already used by other scripts (e.g.
    // purge-expired-works.ts). Confirm no additional raw object/cause leaks
    // beyond that single sanitized string argument.
    expect(errorSpy).toHaveBeenCalledTimes(1);
    const [errorCallArgs] = errorSpy.mock.calls;
    expect(errorCallArgs).toEqual([
      'Erro ao sincronizar índices.',
      fakeConnectionStringError.message,
    ]);
    expect(errorCallArgs).toHaveLength(2);
    errorCallArgs.forEach((arg) => {
      expect(arg).not.toBeInstanceOf(Error);
      expect(arg).not.toHaveProperty('cause');
    });

    expect(process.exitCode).toBe(1);
    expect(disconnectDatabaseMock).toHaveBeenCalledTimes(1);
    expect(logSpy).not.toHaveBeenCalledWith(
      'Índices sincronizados com sucesso.',
    );

    process.exitCode = originalExitCode;
  });

  it('quando o valor rejeitado não é uma instância de Error, loga uma mensagem genérica sem vazar o valor bruto', async () => {
    const connectDatabaseMock = jest.fn<(uri: string) => Promise<void>>(() =>
      Promise.reject('mongodb://fake-test-user:fake-test-pass@localhost:27017'),
    );
    const disconnectDatabaseMock = jest.fn<() => Promise<void>>(() =>
      Promise.resolve(),
    );
    const workSyncIndexesMock = jest.fn<() => Promise<void>>(() =>
      Promise.resolve(),
    );
    const categorySyncIndexesMock = jest.fn<() => Promise<void>>(() =>
      Promise.resolve(),
    );
    const tagSyncIndexesMock = jest.fn<() => Promise<void>>(() =>
      Promise.resolve(),
    );

    const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

    const originalExitCode = process.exitCode;
    process.exitCode = undefined;

    jest.doMock('../../../src/infra/config/env', () => ({
      env: { mongoUri: 'mongodb://unit-test' },
    }));
    jest.doMock('../../../src/infra/database/mongoose', () => ({
      connectDatabase: connectDatabaseMock,
      disconnectDatabase: disconnectDatabaseMock,
    }));
    jest.doMock('../../../src/data/models/work.model', () => ({
      WorkModel: { syncIndexes: workSyncIndexesMock },
    }));
    jest.doMock('../../../src/data/models/category.model', () => ({
      CategoryModel: { syncIndexes: categorySyncIndexesMock },
    }));
    jest.doMock('../../../src/data/models/tag.model', () => ({
      TagModel: { syncIndexes: tagSyncIndexesMock },
    }));

    jest.isolateModules(() => {
      require('../../../src/main/create-indexes');
    });

    await waitFor(() => disconnectDatabaseMock.mock.calls.length > 0);

    expect(errorSpy).toHaveBeenCalledWith(
      'Erro ao sincronizar índices.',
      'erro desconhecido',
    );
    expect(process.exitCode).toBe(1);
    expect(disconnectDatabaseMock).toHaveBeenCalledTimes(1);
    expect(logSpy).not.toHaveBeenCalledWith(
      'Índices sincronizados com sucesso.',
    );

    process.exitCode = originalExitCode;
  });
});
