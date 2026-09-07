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

  it('wraps unknown connection errors in a sanitized error, preserving the original as cause (FR-004, AC-004)', async () => {
    const connectionError = new Error('connection timeout');
    mongooseMock.connect.mockRejectedValueOnce(connectionError);

    await expect(connectDatabase('mongodb://atlas')).rejects.toMatchObject({
      message:
        'Não foi possível conectar ao MongoDB. Verifique a configuração de MONGO_URI e a conectividade com o servidor.',
      cause: connectionError,
    });
  });

  it('never includes the raw driver message content when it looks like it embeds a connection string (NFR-001, FR-004, AC-004)', async () => {
    const fakeLeakySubstring =
      'connect ECONNREFUSED to mongodb://fake-test-user:fake-test-pass@localhost:27017';
    const leakyError = new Error(fakeLeakySubstring);
    mongooseMock.connect.mockRejectedValueOnce(leakyError);

    let thrown: unknown;
    try {
      await connectDatabase('mongodb://atlas');
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(Error);
    expect((thrown as Error).message).not.toContain(fakeLeakySubstring);
    expect((thrown as Error & { cause?: unknown }).cause).toBe(leakyError);
  });

  it('disconnects from database', async () => {
    mongooseMock.disconnect.mockResolvedValueOnce(undefined);

    await disconnectDatabase();

    expect(mongooseMock.disconnect).toHaveBeenCalledTimes(1);
  });

  it('walks an Error cause chain, concatenating each message', async () => {
    const rootCause = new Error('causa raiz');
    const mainError = new Error('erro principal') as Error & {
      cause?: unknown;
    };
    mainError.cause = rootCause;
    mongooseMock.connect.mockRejectedValueOnce(mainError);

    await expect(connectDatabase('mongodb://atlas')).rejects.toMatchObject({
      message:
        'Não foi possível conectar ao MongoDB. Verifique a configuração de MONGO_URI e a conectividade com o servidor.',
      cause: mainError,
    });
  });

  it('extracts message/cause/reason from a plain object shaped like an error', async () => {
    const shapedError = {
      message: 'falha customizada',
      cause: 'causa string',
      reason: 'motivo string',
    };
    mongooseMock.connect.mockRejectedValueOnce(shapedError);

    await expect(connectDatabase('mongodb://atlas')).rejects.toMatchObject({
      message:
        'Não foi possível conectar ao MongoDB. Verifique a configuração de MONGO_URI e a conectividade com o servidor.',
      cause: shapedError,
    });
  });

  it('skips a candidate without a message and without a reason key', async () => {
    const noMessageNode = { cause: 'causa sem mensagem' };
    const mainError = new Error('primeiro') as Error & { cause?: unknown };
    mainError.cause = noMessageNode;
    mongooseMock.connect.mockRejectedValueOnce(mainError);

    await expect(connectDatabase('mongodb://atlas')).rejects.toMatchObject({
      message:
        'Não foi possível conectar ao MongoDB. Verifique a configuração de MONGO_URI e a conectividade com o servidor.',
      cause: mainError,
    });
  });

  it('does not loop forever when the cause chain is cyclic', async () => {
    const cyclicError = new Error('erro cíclico') as Error & {
      cause?: unknown;
    };
    cyclicError.cause = cyclicError;
    mongooseMock.connect.mockRejectedValueOnce(cyclicError);

    await expect(connectDatabase('mongodb://atlas')).rejects.toMatchObject({
      message:
        'Não foi possível conectar ao MongoDB. Verifique a configuração de MONGO_URI e a conectividade com o servidor.',
      cause: cyclicError,
    });
  });
});
