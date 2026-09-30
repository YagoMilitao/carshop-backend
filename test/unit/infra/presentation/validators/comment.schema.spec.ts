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

  it('rejeita propriedade desconhecida (.strict(), FR-005/AC-001)', () => {
    const result = createCommentSchema.safeParse({
      authorName: 'Maria',
      content: 'Comentário válido',
      isApproved: true,
    });

    expect(result.success).toBe(false);
  });

  it('rejeita content contendo <script> (AC-001)', () => {
    const result = createCommentSchema.safeParse({
      authorName: 'Maria',
      content: '<script>alert(1)</script>',
    });

    expect(result.success).toBe(false);
  });

  it('rejeita authorName contendo atributo de evento (AC-002)', () => {
    const result = createCommentSchema.safeParse({
      authorName: '<img src=x onerror=alert(1)>',
      content: 'Comentário válido',
    });

    expect(result.success).toBe(false);
  });

  it('rejeita content contendo atributo de evento inline (AC-003)', () => {
    const result = createCommentSchema.safeParse({
      authorName: 'Maria',
      content: '<div onclick="alert(1)">hi</div>',
    });

    expect(result.success).toBe(false);
  });

  it('rejeita content contendo URI javascript: (AC-004)', () => {
    const result = createCommentSchema.safeParse({
      authorName: 'Maria',
      content: '<a href="javascript:alert(1)">click</a>',
    });

    expect(result.success).toBe(false);
  });

  it('rejeita content contendo tag com "/" como separador, sem espaço (bypass)', () => {
    const result = createCommentSchema.safeParse({
      authorName: 'Maria',
      content: '<img/src=x>',
    });

    expect(result.success).toBe(false);
  });

  it('rejeita content contendo tag com "/" como separador e URI data: com HTML/script embutido (bypass)', () => {
    const result = createCommentSchema.safeParse({
      authorName: 'Maria',
      content: '<object/data=data:text/html;base64,QUJD>',
    });

    expect(result.success).toBe(false);
  });

  it('aceita submissão em texto plano (AC-005)', () => {
    const result = createCommentSchema.safeParse({
      authorName: 'Maria Silva',
      content: 'Ótimo trabalho, ficou excelente!',
    });

    expect(result.success).toBe(true);
  });
});
