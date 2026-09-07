import { expect, describe, it } from '@jest/globals';
import { HealthCheckPingModel } from '../../../../src/data/models/health-check-ping.model';

describe('HealthCheckPingModel (FR-006, AC-005)', () => {
  it('deve validar um documento com marker válido', async () => {
    const document = new HealthCheckPingModel({ marker: 'health-check-1' });

    await expect(document.validate()).resolves.toBeUndefined();
    expect(document.marker).toBe('health-check-1');
  });

  it('deve exigir o campo marker', async () => {
    const document = new HealthCheckPingModel({});

    await expect(document.validate()).rejects.toThrow();
  });

  it('deve usar a coleção health_check_pings, sem hooks/validadores/índices customizados', () => {
    expect(HealthCheckPingModel.collection.collectionName).toBe(
      'health_check_pings',
    );
    expect(HealthCheckPingModel.schema.indexes()).toHaveLength(0);
  });
});
