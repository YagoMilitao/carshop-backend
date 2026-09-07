import {
  expect,
  describe,
  it,
  beforeEach,
  afterEach,
  afterAll,
  jest,
} from '@jest/globals';

describe('verify-read-write script (FR-006, AC-005, NFR-001, NFR-003)', () => {
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

  it('conecta, cria um documento, confirma a leitura, remove o documento no finally e desconecta (happy path, sem dados residuais)', async () => {
    const connectDatabaseMock = jest.fn<(uri: string) => Promise<void>>(() =>
      Promise.resolve(),
    );
    const disconnectDatabaseMock = jest.fn<() => Promise<void>>(() =>
      Promise.resolve(),
    );

    let capturedMarker = '';
    const createMock = jest.fn(
      async (payload: { marker: string }): Promise<{ _id: string }> => {
        capturedMarker = payload.marker;
        return { _id: 'ping-id' };
      },
    );
    const leanMock = jest.fn<() => Promise<{ _id: string; marker?: string }>>(
      async () => ({
        _id: 'ping-id',
        marker: capturedMarker,
      }),
    );
    const findByIdMock = jest.fn<(id: string) => { lean: typeof leanMock }>(
      () => ({ lean: leanMock }),
    );
    const deleteOneMock = jest.fn<
      (filter: { marker: string }) => Promise<{ acknowledged: boolean }>
    >(async () => ({ acknowledged: true }));

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
    jest.doMock('../../../src/data/models/health-check-ping.model', () => ({
      HealthCheckPingModel: {
        create: createMock,
        findById: findByIdMock,
        deleteOne: deleteOneMock,
      },
    }));

    jest.isolateModules(() => {
      require('../../../src/main/verify-read-write');
    });

    await waitFor(() => disconnectDatabaseMock.mock.calls.length > 0);

    expect(connectDatabaseMock).toHaveBeenCalledWith('mongodb://unit-test');
    expect(createMock).toHaveBeenCalledTimes(1);
    expect(capturedMarker).toMatch(
      /^health-check-\d+-[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
    expect(findByIdMock).toHaveBeenCalledWith('ping-id');
    expect(deleteOneMock).toHaveBeenCalledWith({ marker: capturedMarker });
    expect(logSpy).toHaveBeenCalledWith(
      expect.stringContaining('sem dados residuais'),
    );
    expect(errorSpy).not.toHaveBeenCalled();
    expect(disconnectDatabaseMock).toHaveBeenCalledTimes(1);
    expect(process.exitCode).toBeUndefined();

    process.exitCode = originalExitCode;
  });

  it('quando o documento lido não corresponde ao escrito, ainda assim remove o documento (finally) antes de reportar a falha', async () => {
    const connectDatabaseMock = jest.fn<(uri: string) => Promise<void>>(() =>
      Promise.resolve(),
    );
    const disconnectDatabaseMock = jest.fn<() => Promise<void>>(() =>
      Promise.resolve(),
    );

    let capturedMarker = '';
    const createMock = jest.fn(
      async (payload: { marker: string }): Promise<{ _id: string }> => {
        capturedMarker = payload.marker;
        return { _id: 'ping-id' };
      },
    );
    const leanMock = jest.fn<() => Promise<{ _id: string; marker: string }>>(
      async () => ({
        _id: 'ping-id',
        marker: 'unexpected-marker',
      }),
    );
    const findByIdMock = jest.fn<(id: string) => { lean: typeof leanMock }>(
      () => ({ lean: leanMock }),
    );
    const deleteOneMock = jest.fn<
      (filter: { marker: string }) => Promise<{ acknowledged: boolean }>
    >(async () => ({ acknowledged: true }));

    jest.spyOn(console, 'log').mockImplementation(() => {});
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
    jest.doMock('../../../src/data/models/health-check-ping.model', () => ({
      HealthCheckPingModel: {
        create: createMock,
        findById: findByIdMock,
        deleteOne: deleteOneMock,
      },
    }));

    jest.isolateModules(() => {
      require('../../../src/main/verify-read-write');
    });

    await waitFor(() => disconnectDatabaseMock.mock.calls.length > 0);

    expect(deleteOneMock).toHaveBeenCalledWith({ marker: capturedMarker });
    expect(errorSpy).toHaveBeenCalledWith(
      'Erro ao executar a verificação de leitura/escrita.',
    );
    expect(process.exitCode).toBe(1);
    expect(disconnectDatabaseMock).toHaveBeenCalledTimes(1);

    process.exitCode = originalExitCode;
  });

  it('quando a escrita é confirmada pelo banco mas a resposta se perde, tenta remover pelo marker conhecido', async () => {
    const connectDatabaseMock = jest.fn<(uri: string) => Promise<void>>(() =>
      Promise.resolve(),
    );
    const disconnectDatabaseMock = jest.fn<() => Promise<void>>(() =>
      Promise.resolve(),
    );

    let capturedMarker = '';
    const createMock = jest.fn((payload: { marker: string }) => {
      capturedMarker = payload.marker;
      return Promise.reject(
        new Error(
          'write acknowledgement lost at mongodb://fake-user:fake-pass@fake-cluster.mongodb.net/carshop',
        ),
      );
    });
    const findByIdMock = jest.fn();
    const deleteOneMock = jest.fn<
      (filter: { marker: string }) => Promise<{ acknowledged: boolean }>
    >(async () => ({ acknowledged: true }));

    jest.spyOn(console, 'log').mockImplementation(() => {});
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
    jest.doMock('../../../src/data/models/health-check-ping.model', () => ({
      HealthCheckPingModel: {
        create: createMock,
        findById: findByIdMock,
        deleteOne: deleteOneMock,
      },
    }));

    jest.isolateModules(() => {
      require('../../../src/main/verify-read-write');
    });

    await waitFor(() => disconnectDatabaseMock.mock.calls.length > 0);

    expect(errorSpy).toHaveBeenCalledWith(
      'Erro ao executar a verificação de leitura/escrita.',
    );
    expect(JSON.stringify(errorSpy.mock.calls)).not.toContain('fake-user');
    expect(JSON.stringify(errorSpy.mock.calls)).not.toContain('fake-pass');
    expect(JSON.stringify(errorSpy.mock.calls)).not.toContain(
      'fake-cluster.mongodb.net',
    );
    expect(findByIdMock).not.toHaveBeenCalled();
    expect(deleteOneMock).toHaveBeenCalledWith({ marker: capturedMarker });
    expect(process.exitCode).toBe(1);
    expect(disconnectDatabaseMock).toHaveBeenCalledTimes(1);

    process.exitCode = originalExitCode;
  });

  it('quando a remoção de limpeza (cleanup) falha, ainda assim reporta o erro de forma sanitizada e desconecta', async () => {
    const connectDatabaseMock = jest.fn<(uri: string) => Promise<void>>(() =>
      Promise.resolve(),
    );
    const disconnectDatabaseMock = jest.fn<() => Promise<void>>(() =>
      Promise.resolve(),
    );

    let capturedMarker = '';
    const createMock = jest.fn(
      async (payload: { marker: string }): Promise<{ _id: string }> => {
        capturedMarker = payload.marker;
        return { _id: 'ping-id' };
      },
    );
    const leanMock = jest.fn<() => Promise<{ _id: string; marker: string }>>(
      async () => ({
        _id: 'ping-id',
        marker: capturedMarker,
      }),
    );
    const findByIdMock = jest.fn<(id: string) => { lean: typeof leanMock }>(
      () => ({ lean: leanMock }),
    );
    const deleteOneMock = jest.fn<
      (filter: { marker: string }) => Promise<{ acknowledged: boolean }>
    >(() => Promise.reject(new Error('cleanup failed')));

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
    jest.doMock('../../../src/data/models/health-check-ping.model', () => ({
      HealthCheckPingModel: {
        create: createMock,
        findById: findByIdMock,
        deleteOne: deleteOneMock,
      },
    }));

    jest.isolateModules(() => {
      require('../../../src/main/verify-read-write');
    });

    await waitFor(() => disconnectDatabaseMock.mock.calls.length > 0);

    expect(deleteOneMock).toHaveBeenCalledWith({ marker: capturedMarker });
    expect(errorSpy).toHaveBeenCalledWith(
      'Erro ao executar a verificação de leitura/escrita.',
    );
    expect(logSpy).not.toHaveBeenCalled();
    expect(process.exitCode).toBe(1);
    expect(disconnectDatabaseMock).toHaveBeenCalledTimes(1);

    process.exitCode = originalExitCode;
  });

  it('quando a falha não é uma instância de Error, loga um fallback fixo sanitizado ("erro desconhecido") sem vazar o valor bruto rejeitado', async () => {
    const connectDatabaseMock = jest.fn<(uri: string) => Promise<void>>(() =>
      Promise.resolve(),
    );
    const disconnectDatabaseMock = jest.fn<() => Promise<void>>(() =>
      Promise.resolve(),
    );

    const createMock = jest.fn(() =>
      // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors
      Promise.reject('mongodb://fake-user:fake-pass@localhost:27017'),
    );
    const findByIdMock = jest.fn();
    const deleteOneMock = jest.fn<
      (filter: { marker: string }) => Promise<{ acknowledged: boolean }>
    >(async () => ({ acknowledged: true }));

    jest.spyOn(console, 'log').mockImplementation(() => {});
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
    jest.doMock('../../../src/data/models/health-check-ping.model', () => ({
      HealthCheckPingModel: {
        create: createMock,
        findById: findByIdMock,
        deleteOne: deleteOneMock,
      },
    }));

    jest.isolateModules(() => {
      require('../../../src/main/verify-read-write');
    });

    await waitFor(() => disconnectDatabaseMock.mock.calls.length > 0);

    expect(errorSpy).toHaveBeenCalledWith(
      'Erro ao executar a verificação de leitura/escrita.',
    );
    expect(JSON.stringify(errorSpy.mock.calls)).not.toContain('fake-user');
    expect(JSON.stringify(errorSpy.mock.calls)).not.toContain('fake-pass');
    expect(findByIdMock).not.toHaveBeenCalled();
    expect(deleteOneMock).toHaveBeenCalledWith({
      marker: expect.stringMatching(/^health-check-/),
    });
    expect(process.exitCode).toBe(1);
    expect(disconnectDatabaseMock).toHaveBeenCalledTimes(1);

    process.exitCode = originalExitCode;
  });
});
