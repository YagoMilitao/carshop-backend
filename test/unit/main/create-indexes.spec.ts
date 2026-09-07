import {
  expect,
  describe,
  it,
  beforeEach,
  afterEach,
  afterAll,
  jest,
} from '@jest/globals';

describe('create-indexes script (FR-003, FR-004, FR-005, NFR-001, NFR-003)', () => {
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

  const MODEL_KEYS = [
    'work.model',
    'category.model',
    'tag.model',
    'comment.model',
    'work-image.model',
    'admin-user.model',
    'auth-session.model',
    'portfolio-work',
  ] as const;

  const MODEL_EXPORT_NAMES: Record<(typeof MODEL_KEYS)[number], string> = {
    'work.model': 'WorkModel',
    'category.model': 'CategoryModel',
    'tag.model': 'TagModel',
    'comment.model': 'CommentModel',
    'work-image.model': 'WorkImageModel',
    'admin-user.model': 'AdminUserModel',
    'auth-session.model': 'AuthSessionModel',
    'portfolio-work': 'PortfolioWorkModel',
  };

  interface ModelMockHandles {
    readonly createIndexesMock: jest.Mock<() => Promise<void>>;
    readonly collectionIndexesMock: jest.Mock<
      () => Promise<Array<{ key: Record<string, number>; name: string }>>
    >;
  }

  function mockAllModels(
    overrides: Partial<
      Record<
        (typeof MODEL_KEYS)[number],
        {
          declaredIndexes?: Array<[Record<string, number>, unknown]>;
          actualIndexes?: Array<{ key: Record<string, number>; name: string }>;
          createIndexesImpl?: () => Promise<void>;
        }
      >
    > = {},
  ): Record<(typeof MODEL_KEYS)[number], ModelMockHandles> {
    const handles = {} as Record<
      (typeof MODEL_KEYS)[number],
      ModelMockHandles
    >;

    for (const key of MODEL_KEYS) {
      const override = overrides[key] ?? {};
      const declaredIndexes = override.declaredIndexes ?? [
        [{ id: 1 }, { unique: true }],
      ];
      const actualIndexes = override.actualIndexes ?? [
        { key: { id: 1 }, name: 'id_1' },
      ];

      const createIndexesMock = jest.fn<() => Promise<void>>(
        override.createIndexesImpl ?? (() => Promise.resolve()),
      );
      const collectionIndexesMock = jest.fn<
        () => Promise<Array<{ key: Record<string, number>; name: string }>>
      >(() => Promise.resolve(actualIndexes));

      handles[key] = { createIndexesMock, collectionIndexesMock };

      jest.doMock(`../../../src/data/models/${key}`, () => ({
        [MODEL_EXPORT_NAMES[key]]: {
          modelName: MODEL_EXPORT_NAMES[key],
          createIndexes: createIndexesMock,
          schema: { indexes: () => declaredIndexes },
          collection: { indexes: collectionIndexesMock },
        },
      }));
    }

    return handles;
  }

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

  it('conecta, garante os índices de todos os 8 modelos via createIndexes (nunca syncIndexes/drop), reporta presença e sempre desconecta (happy path)', async () => {
    const connectDatabaseMock = jest.fn<(uri: string) => Promise<void>>(() =>
      Promise.resolve(),
    );
    const disconnectDatabaseMock = jest.fn<() => Promise<void>>(() =>
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

    const handles = mockAllModels();

    jest.isolateModules(() => {
      require('../../../src/main/create-indexes');
    });

    await waitFor(() => disconnectDatabaseMock.mock.calls.length > 0);

    expect(connectDatabaseMock).toHaveBeenCalledWith('mongodb://unit-test');

    for (const key of MODEL_KEYS) {
      expect(handles[key].createIndexesMock).toHaveBeenCalledTimes(1);
      expect(handles[key].collectionIndexesMock).toHaveBeenCalledTimes(1);
    }

    expect(logSpy).toHaveBeenCalledWith(
      expect.stringContaining('modo aditivo'),
    );
    // Every declared index in the fixture is present in the mocked
    // collection, so the report must say "sim" for every model.
    for (const key of MODEL_KEYS) {
      expect(logSpy).toHaveBeenCalledWith(
        expect.stringContaining(
          `${MODEL_EXPORT_NAMES[key]} | campos: id | presente: sim`,
        ),
      );
    }

    expect(errorSpy).not.toHaveBeenCalled();
    expect(disconnectDatabaseMock).toHaveBeenCalledTimes(1);
    expect(process.exitCode).toBeUndefined();

    process.exitCode = originalExitCode;
  });

  it('reporta um índice declarado como ausente quando ele não existe na coleção real, sem tentar criá-lo/removê-lo explicitamente além de createIndexes', async () => {
    const connectDatabaseMock = jest.fn<(uri: string) => Promise<void>>(() =>
      Promise.resolve(),
    );
    const disconnectDatabaseMock = jest.fn<() => Promise<void>>(() =>
      Promise.resolve(),
    );

    const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});

    jest.doMock('../../../src/infra/config/env', () => ({
      env: { mongoUri: 'mongodb://unit-test' },
    }));
    jest.doMock('../../../src/infra/database/mongoose', () => ({
      connectDatabase: connectDatabaseMock,
      disconnectDatabase: disconnectDatabaseMock,
    }));

    mockAllModels({
      'work.model': {
        declaredIndexes: [[{ slug: 1 }, { unique: true }]],
        actualIndexes: [],
      },
    });

    jest.isolateModules(() => {
      require('../../../src/main/create-indexes');
    });

    await waitFor(() => disconnectDatabaseMock.mock.calls.length > 0);

    expect(logSpy).toHaveBeenCalledWith(
      expect.stringContaining('WorkModel | campos: slug | presente: não'),
    );
  });

  it('reporta "(sem campos)" quando um índice declarado não possui nenhum campo (caso defensivo/edge case)', async () => {
    const connectDatabaseMock = jest.fn<(uri: string) => Promise<void>>(() =>
      Promise.resolve(),
    );
    const disconnectDatabaseMock = jest.fn<() => Promise<void>>(() =>
      Promise.resolve(),
    );

    const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});

    jest.doMock('../../../src/infra/config/env', () => ({
      env: { mongoUri: 'mongodb://unit-test' },
    }));
    jest.doMock('../../../src/infra/database/mongoose', () => ({
      connectDatabase: connectDatabaseMock,
      disconnectDatabase: disconnectDatabaseMock,
    }));

    mockAllModels({
      'work.model': {
        declaredIndexes: [[{}, {}]],
        actualIndexes: [],
      },
    });

    jest.isolateModules(() => {
      require('../../../src/main/create-indexes');
    });

    await waitFor(() => disconnectDatabaseMock.mock.calls.length > 0);

    expect(logSpy).toHaveBeenCalledWith(
      expect.stringContaining('WorkModel | campos: (sem campos) | presente: não'),
    );
  });

  it('em caso de falha, loga apenas uma mensagem fixa (sem detalhes do erro), marca exitCode = 1 e ainda assim desconecta', async () => {
    const connectDatabaseMock = jest.fn<(uri: string) => Promise<void>>(() =>
      Promise.reject(
        new Error(
          'connect ECONNREFUSED to mongodb://fake-user:fake-pass@localhost:27017',
        ),
      ),
    );
    const disconnectDatabaseMock = jest.fn<() => Promise<void>>(() =>
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

    mockAllModels();

    jest.isolateModules(() => {
      require('../../../src/main/create-indexes');
    });

    await waitFor(() => disconnectDatabaseMock.mock.calls.length > 0);

    expect(errorSpy).toHaveBeenCalledTimes(1);
    expect(errorSpy).toHaveBeenCalledWith('Erro ao verificar/garantir índices.');
    expect(JSON.stringify(errorSpy.mock.calls)).not.toContain('fake-user');
    expect(JSON.stringify(errorSpy.mock.calls)).not.toContain('fake-pass');

    expect(process.exitCode).toBe(1);
    expect(disconnectDatabaseMock).toHaveBeenCalledTimes(1);
    expect(logSpy).not.toHaveBeenCalledWith(
      expect.stringContaining('modo aditivo'),
    );

    process.exitCode = originalExitCode;
  });

  it('quando createIndexes de um modelo falha com um valor não-Error, ainda assim loga apenas a mensagem fixa e desconecta', async () => {
    const connectDatabaseMock = jest.fn<(uri: string) => Promise<void>>(() =>
      Promise.resolve(),
    );
    const disconnectDatabaseMock = jest.fn<() => Promise<void>>(() =>
      Promise.resolve(),
    );

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

    mockAllModels({
      'work.model': {
        createIndexesImpl: () =>
          // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors
          Promise.reject('mongodb://fake-user:fake-pass@localhost:27017'),
      },
    });

    jest.isolateModules(() => {
      require('../../../src/main/create-indexes');
    });

    await waitFor(() => disconnectDatabaseMock.mock.calls.length > 0);

    expect(errorSpy).toHaveBeenCalledWith('Erro ao verificar/garantir índices.');
    expect(process.exitCode).toBe(1);
    expect(disconnectDatabaseMock).toHaveBeenCalledTimes(1);

    process.exitCode = originalExitCode;
  });
});
