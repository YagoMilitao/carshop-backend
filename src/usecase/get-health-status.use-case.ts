import type { DatabaseHealthCheckPort } from '../core/domain/application/Health/database-health-check.port';

export type HealthStatus = 'ok' | 'degraded';
export type DatabaseHealthStatus = 'connected' | 'disconnected';

export interface HealthStatusResult {
  status: HealthStatus;
  database: DatabaseHealthStatus;
}

/**
 * Caso de uso responsável por determinar a saúde atual do serviço.
 *
 * Motivo:
 * expor um estado observável (processo vivo + conectividade com o banco)
 * para que a plataforma de deploy (Render) possa detectar instâncias
 * degradadas (NFR-003), sem realizar I/O adicional — apenas leitura de
 * estado já mantido pela infraestrutura.
 */
export class GetHealthStatusUseCase {
  constructor(private readonly databaseHealthCheck: DatabaseHealthCheckPort) {}

  execute(): HealthStatusResult {
    if (this.databaseHealthCheck.isConnected()) {
      return { status: 'ok', database: 'connected' };
    }

    return { status: 'degraded', database: 'disconnected' };
  }
}
