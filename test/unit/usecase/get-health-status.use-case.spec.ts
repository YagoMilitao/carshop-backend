import { GetHealthStatusUseCase } from '../../../src/usecase/get-health-status.use-case';
import type { DatabaseHealthCheckPort } from '../../../src/core/domain/application/Health/database-health-check.port';

describe('GetHealthStatusUseCase', () => {
  const buildDatabaseHealthCheck = (
    isConnected: boolean,
  ): jest.Mocked<DatabaseHealthCheckPort> =>
    ({
      isConnected: jest.fn().mockReturnValue(isConnected),
    }) as jest.Mocked<DatabaseHealthCheckPort>;

  it('returns ok/connected when the database is connected', () => {
    const databaseHealthCheck = buildDatabaseHealthCheck(true);
    const useCase = new GetHealthStatusUseCase(databaseHealthCheck);

    const result = useCase.execute();

    expect(result).toEqual({ status: 'ok', database: 'connected' });
    expect(databaseHealthCheck.isConnected).toHaveBeenCalledTimes(1);
  });

  it('returns degraded/disconnected when the database is not connected', () => {
    const databaseHealthCheck = buildDatabaseHealthCheck(false);
    const useCase = new GetHealthStatusUseCase(databaseHealthCheck);

    const result = useCase.execute();

    expect(result).toEqual({ status: 'degraded', database: 'disconnected' });
    expect(databaseHealthCheck.isConnected).toHaveBeenCalledTimes(1);
  });
});
