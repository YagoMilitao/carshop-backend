import mongoose from 'mongoose';
import {
  connectDatabase,
  disconnectDatabase,
} from '../../../../src/infra/database/mongoose';

jest.mock('mongoose', () => ({
  __esModule: true,
  default: {
    connect: jest.fn(),
    disconnect: jest.fn(),
  },
}));

const mongooseMock = mongoose as unknown as {
  connect: jest.Mock;
  disconnect: jest.Mock;
};

describe('mongoose database connector', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('throws when mongo uri is empty', async () => {
    await expect(connectDatabase('')).rejects.toThrow(
      'MONGO_URI não foi informada.',
    );
    expect(mongooseMock.connect).not.toHaveBeenCalled();
  });

  it('connects and logs success message', async () => {
    const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    mongooseMock.connect.mockResolvedValueOnce(mongoose);

    await connectDatabase('mongodb://unit-test');

    expect(mongooseMock.connect).toHaveBeenCalledWith('mongodb://unit-test');
    expect(logSpy).toHaveBeenCalledWith('✅ Conectado ao MongoDB com sucesso.');
  });

  it('maps Atlas IP blocked error into an actionable message', async () => {
    mongooseMock.connect.mockRejectedValueOnce(
      new Error(
        "Could not connect to any servers in your MongoDB Atlas cluster. One common reason is that you're trying to access the database from an IP that isn't whitelisted.",
      ),
    );

    await expect(connectDatabase('mongodb://atlas')).rejects.toThrow(
      'Não foi possível conectar ao MongoDB Atlas porque o IP desta máquina não está liberado. Libere o IP em Atlas > Network Access e tente novamente.',
    );
  });

  it('rethrows unknown connection errors', async () => {
    const connectionError = new Error('connection timeout');
    mongooseMock.connect.mockRejectedValueOnce(connectionError);

    await expect(connectDatabase('mongodb://atlas')).rejects.toBe(
      connectionError,
    );
  });

  it('disconnects from database', async () => {
    mongooseMock.disconnect.mockResolvedValueOnce(undefined);

    await disconnectDatabase();

    expect(mongooseMock.disconnect).toHaveBeenCalledTimes(1);
  });
});
