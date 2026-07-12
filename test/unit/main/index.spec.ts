import {
  expect,
  describe,
  it,
  beforeEach,
  afterAll,
  jest,
  afterEach,
} from '@jest/globals';

const waitForBootstrap = () =>
  new Promise<void>((resolve) => {
    setImmediate(resolve);
  });

describe('main bootstrap', () => {
  const originalEnv = process.env;

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

  it('starts server using PORT from env', async () => {
    const listen = jest.fn((port: number, callback: () => void) => {
      callback();
      return {} as never;
    });
    const createAppMock = jest.fn(() => ({ listen }));
    const connectDatabaseMock = jest.fn<(uri: string) => Promise<void>>(() =>
      Promise.resolve(),
    );
    const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});

    jest.doMock('../../../src/infra/config/env', () => ({
      env: { mongoUri: 'mongodb://unit-test', port: 4567 },
    }));
    jest.doMock('../../../src/infra/database/mongoose', () => ({
      connectDatabase: connectDatabaseMock,
    }));
    jest.doMock('../../../src/infra/server', () => ({
      createApp: createAppMock,
    }));

    jest.isolateModules(() => {
      require('../../../src/main');
    });

    await waitForBootstrap();

    expect(connectDatabaseMock).toHaveBeenCalledWith('mongodb://unit-test');
    expect(createAppMock).toHaveBeenCalledTimes(1);
    expect(listen).toHaveBeenCalledWith(4567, expect.any(Function));
    expect(logSpy).toHaveBeenLastCalledWith(
      '✅ Servidor HTTP rodando em http://localhost:4567',
    );
  });

  it('falls back to port 3000 when PORT is not defined', async () => {
    const listen = jest.fn((port: number, callback: () => void) => {
      callback();
      return {} as never;
    });
    const createAppMock = jest.fn(() => ({ listen }));
    const connectDatabaseMock = jest.fn<(uri: string) => Promise<void>>(() =>
      Promise.resolve(),
    );
    const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});

    jest.doMock('../../../src/infra/config/env', () => ({
      env: { mongoUri: 'mongodb://unit-test', port: 3000 },
    }));
    jest.doMock('../../../src/infra/database/mongoose', () => ({
      connectDatabase: connectDatabaseMock,
    }));
    jest.doMock('../../../src/infra/server', () => ({
      createApp: createAppMock,
    }));

    jest.isolateModules(() => {
      require('../../../src/main');
    });

    await waitForBootstrap();

    expect(connectDatabaseMock).toHaveBeenCalledWith('mongodb://unit-test');
    expect(createAppMock).toHaveBeenCalledTimes(1);
    expect(listen).toHaveBeenCalledWith(3000, expect.any(Function));
    expect(logSpy).toHaveBeenLastCalledWith(
      '✅ Servidor HTTP rodando em http://localhost:3000',
    );
  });
});
