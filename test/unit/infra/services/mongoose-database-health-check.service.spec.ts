const mockConnection: { readyState: number } = { readyState: 0 };

jest.mock('mongoose', () => ({
  __esModule: true,
  default: {
    connection: mockConnection,
  },
}));

import { MongooseDatabaseHealthCheckService } from '../../../../src/infra/services/mongoose-database-health-check.service';

describe('MongooseDatabaseHealthCheckService', () => {
  const service = new MongooseDatabaseHealthCheckService();

  afterEach(() => {
    mockConnection.readyState = 0;
  });

  it('returns true when readyState is 1 (connected)', () => {
    mockConnection.readyState = 1;

    expect(service.isConnected()).toBe(true);
  });

  it.each([0, 2, 3])(
    'returns false when readyState is %i (not connected)',
    (readyState) => {
      mockConnection.readyState = readyState;

      expect(service.isConnected()).toBe(false);
    },
  );
});
