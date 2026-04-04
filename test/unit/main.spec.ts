describe('main bootstrap', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('starts server using PORT from env', () => {
    process.env.PORT = '4567';
    const listen = jest.fn((port: number, callback: () => void) => {
      callback();
      return {} as never;
    });
    const createAppMock = jest.fn(() => ({ listen }));
    const logSpy = jest.spyOn(console, 'log').mockImplementation();

    jest.doMock('../../src/app', () => ({
      createApp: createAppMock,
    }));

    jest.isolateModules(() => {
      require('../../src/main');
    });

    expect(createAppMock).toHaveBeenCalledTimes(1);
    expect(listen).toHaveBeenCalledWith(4567, expect.any(Function));
    expect(logSpy).toHaveBeenCalledWith(
      'Servidor HTTP rodando em http://localhost:4567',
    );

    logSpy.mockRestore();
  });

  it('falls back to port 3000 when PORT is not defined', () => {
    delete process.env.PORT;
    const listen = jest.fn((port: number, callback: () => void) => {
      callback();
      return {} as never;
    });
    const createAppMock = jest.fn(() => ({ listen }));
    const logSpy = jest.spyOn(console, 'log').mockImplementation();

    jest.doMock('../../src/app', () => ({
      createApp: createAppMock,
    }));

    jest.isolateModules(() => {
      require('../../src/main');
    });

    expect(listen).toHaveBeenCalledWith(3000, expect.any(Function));
    expect(logSpy).toHaveBeenCalledWith(
      'Servidor HTTP rodando em http://localhost:3000',
    );

    logSpy.mockRestore();
  });
});
