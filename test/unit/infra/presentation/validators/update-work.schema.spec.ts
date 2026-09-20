import { updateWorkSchema } from '../../../../../src/infra/presentation/validators/update-work.schema';

describe('updateWorkSchema', () => {
  it('aceita uma atualização parcial válida', () => {
    expect(updateWorkSchema.safeParse({ title: 'Novo título' }).success).toBe(
      true,
    );
  });

  it('rejeita category acima do limite de 120 caracteres', () => {
    expect(
      updateWorkSchema.safeParse({ category: 'a'.repeat(121) }).success,
    ).toBe(false);
  });

  it.each(['__proto__', 'constructor', 'prototype', '$where', 'title.nested'])(
    'rejeita a chave não permitida %s antes de reconstruir o objeto',
    (dangerousKey) => {
      const payload = JSON.parse(
        `{"${dangerousKey}":{"polluted":true},"title":"Título malicioso"}`,
      ) as Record<string, unknown>;

      expect(updateWorkSchema.safeParse(payload).success).toBe(false);
    },
  );

  it('rejeita payload vazio', () => {
    expect(updateWorkSchema.safeParse({}).success).toBe(false);
  });
});
