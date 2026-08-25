import { updateCommentSchema } from '../../../../../src/infra/presentation/validators/update-comment.schema';

describe('updateCommentSchema', () => {
  it('aceita atualização parcial apenas com content', () => {
    const result = updateCommentSchema.safeParse({ content: 'Editado' });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toEqual({ content: 'Editado' });
    }
  });

  it('aceita atualização com status válido', () => {
    const result = updateCommentSchema.safeParse({ status: 'APPROVED' });

    expect(result.success).toBe(true);
  });

  it('rejeita status inválido', () => {
    const result = updateCommentSchema.safeParse({ status: 'REJECTED' });

    expect(result.success).toBe(false);
  });

  it('rejeita payload sem nenhum campo', () => {
    const result = updateCommentSchema.safeParse({});

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toBe(
        'Informe ao menos um campo para atualização.',
      );
    }
  });

  it('rejeita authorName muito curto quando informado', () => {
    const result = updateCommentSchema.safeParse({ authorName: 'M' });

    expect(result.success).toBe(false);
  });
});
