import { createCommentSchema } from '../../../../../src/infra/presentation/validators/comment.schema';

describe('createCommentSchema', () => {
  it('aceita um payload válido e normaliza espaços em branco', () => {
    const result = createCommentSchema.safeParse({
      authorName: '  Maria  ',
      content: '  Ótimo trabalho!  ',
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toEqual({
        authorName: 'Maria',
        content: 'Ótimo trabalho!',
      });
    }
  });

  it('rejeita nome muito curto', () => {
    const result = createCommentSchema.safeParse({
      authorName: 'M',
      content: 'Comentário válido',
    });

    expect(result.success).toBe(false);
  });

  it('rejeita conteúdo muito curto', () => {
    const result = createCommentSchema.safeParse({
      authorName: 'Maria',
      content: 'Oi',
    });

    expect(result.success).toBe(false);
  });

  it('rejeita nome maior que o limite', () => {
    const result = createCommentSchema.safeParse({
      authorName: 'a'.repeat(81),
      content: 'Comentário válido',
    });

    expect(result.success).toBe(false);
  });

  it('rejeita conteúdo maior que o limite', () => {
    const result = createCommentSchema.safeParse({
      authorName: 'Maria',
      content: 'a'.repeat(1001),
    });

    expect(result.success).toBe(false);
  });
});
