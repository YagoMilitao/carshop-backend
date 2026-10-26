import { createCommentSchema } from '../../../../../src/infra/presentation/validators/comment.schema';
import { COMMENT_HONEYPOT_FIELD } from '../../../../../src/infra/presentation/middleware/anti-bot.middleware';

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

  describe('campo de controle anti-automação (CARSHOP-140)', () => {
    it('aceita payload sem o campo de controle (AC-001)', () => {
      const result = createCommentSchema.safeParse({
        authorName: 'Maria',
        content: 'Comentário válido',
      });

      expect(result.success).toBe(true);
    });

    it('aceita o campo de controle como string vazia (AC-001)', () => {
      const result = createCommentSchema.safeParse({
        authorName: 'Maria',
        content: 'Comentário válido',
        [COMMENT_HONEYPOT_FIELD]: '',
      });

      expect(result.success).toBe(true);
    });

    it('rejeita o campo de controle preenchido (defesa em profundidade)', () => {
      const result = createCommentSchema.safeParse({
        authorName: 'Maria',
        content: 'Comentário válido',
        [COMMENT_HONEYPOT_FIELD]: 'x',
      });

      expect(result.success).toBe(false);
    });

    it.each([
      ['só espaços', ' '],
      ['número', 0],
      ['null', null],
      ['objeto', {}],
    ])('rejeita o campo de controle com valor %s', (_label, controlValue) => {
      const result = createCommentSchema.safeParse({
        authorName: 'Maria',
        content: 'Comentário válido',
        [COMMENT_HONEYPOT_FIELD]: controlValue,
      });

      expect(result.success).toBe(false);
    });

    it('não inclui o campo de controle na saída quando ausente', () => {
      const result = createCommentSchema.safeParse({
        authorName: 'Maria',
        content: 'Comentário válido',
      });

      expect(result.success && result.data).not.toHaveProperty(
        COMMENT_HONEYPOT_FIELD,
      );
    });

    it('continua rejeitando campos desconhecidos como isApproved e variações de caixa do campo', () => {
      for (const extra of [{ isApproved: true }, { Website: '' }]) {
        const result = createCommentSchema.safeParse({
          authorName: 'Maria',
          content: 'Comentário válido',
          ...extra,
        });

        expect(result.success).toBe(false);
      }
    });

    it('rejeita chave "__proto__" vinda de JSON.parse (tentativa de contornar o middleware)', () => {
      const body: unknown = JSON.parse(
        '{"authorName":"Maria","content":"Comentário válido","__proto__":{"website":"x"}}',
      );

      expect(createCommentSchema.safeParse(body).success).toBe(false);
    });

    it('usa a mesma chave exportada pelo middleware anti-automação', () => {
      expect(Object.keys(createCommentSchema.shape)).toContain(
        COMMENT_HONEYPOT_FIELD,
      );
    });
  });
});
