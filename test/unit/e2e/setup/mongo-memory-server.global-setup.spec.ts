const createMock = jest.fn();
const setMongoMemoryServerMock = jest.fn();

jest.mock('mongodb-memory-server', () => ({
  MongoMemoryServer: {
    create: createMock,
  },
}));

jest.mock('../../../e2e/setup/mongo-memory-server.context', () => ({
  setMongoMemoryServer: setMongoMemoryServerMock,
}));

import globalSetup from '../../../e2e/setup/mongo-memory-server.global-setup';

describe('mongo-memory-server global setup', () => {
  const originalMongoUri = process.env.MONGO_URI;

  afterEach(() => {
    jest.clearAllMocks();

    if (originalMongoUri === undefined) {
      delete process.env.MONGO_URI;
    } else {
      process.env.MONGO_URI = originalMongoUri;
    }
  });

  it('starts MongoDB with a binary version available for Ubuntu 24.04', async () => {
    const server = {
      getUri: jest.fn().mockReturnValue('mongodb://127.0.0.1:27017/test'),
    };
    createMock.mockResolvedValue(server);

    await globalSetup();

    expect(createMock).toHaveBeenCalledWith({
      binary: { version: '8.0.29' },
    });
    expect(process.env.MONGO_URI).toBe('mongodb://127.0.0.1:27017/test');
    expect(setMongoMemoryServerMock).toHaveBeenCalledWith(server);
  });
});
