import { listAdminCommentsQuerySchema } from '../../../../../src/infra/presentation/validators/list-admin-comments-query.schema';

describe('listAdminCommentsQuerySchema (CARSHOP-136)', () => {
  it.each(['PENDING', 'APPROVED', 'HIDDEN'] as const)(
    'aceita o valor de status válido %s (AC-003, AC-004, AC-005)',
    (status) => {
      const result = listAdminCommentsQuerySchema.safeParse({ status });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.status).toBe(status);
      }
    },
  );

  it('rejeita um valor de status fora do conjunto permitido (AC-006, FR-004)', () => {
    const result = listAdminCommentsQuerySchema.safeParse({
      status: 'INVALID',
    });

    expect(result.success).toBe(false);
  });

  it('aplica page=1 e limit=20 como padrão quando não informados (AC-002)', () => {
    const result = listAdminCommentsQuerySchema.safeParse({});

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.page).toBe(1);
      expect(result.data.limit).toBe(20);
      expect(result.data.status).toBeUndefined();
    }
  });

  it('coage valores de string vindos da query string para número (page/limit)', () => {
    const result = listAdminCommentsQuerySchema.safeParse({
      page: '2',
      limit: '10',
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.page).toBe(2);
      expect(result.data.limit).toBe(10);
    }
  });

  it('rejeita limit acima do máximo permitido (100)', () => {
    const result = listAdminCommentsQuerySchema.safeParse({ limit: '101' });

    expect(result.success).toBe(false);
  });

  it('aceita limit exatamente no máximo permitido (100)', () => {
    const result = listAdminCommentsQuerySchema.safeParse({ limit: '100' });

    expect(result.success).toBe(true);
  });

  it('rejeita page menor que 1', () => {
    const result = listAdminCommentsQuerySchema.safeParse({ page: '0' });

    expect(result.success).toBe(false);
  });

  it('rejeita page negativo', () => {
    const result = listAdminCommentsQuerySchema.safeParse({ page: '-1' });

    expect(result.success).toBe(false);
  });

  it('rejeita page não inteiro', () => {
    const result = listAdminCommentsQuerySchema.safeParse({ page: '1.5' });

    expect(result.success).toBe(false);
  });

  it('rejeita chaves de query desconhecidas/extra por ser .strict()', () => {
    const result = listAdminCommentsQuerySchema.safeParse({
      status: 'PENDING',
      unknownField: 'x',
    });

    expect(result.success).toBe(false);
  });
});
