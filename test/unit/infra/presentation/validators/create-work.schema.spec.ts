import { createWorkSchema } from '../../../../../src/infra/presentation/validators/create-work.schema';

describe('createWorkSchema', () => {
  it('aceita um payload válido completo (happy path)', () => {
    const result = createWorkSchema.safeParse({
      slug: 'work-slug',
      title: 'Work title',
      description: 'Work description',
      category: 'bancos',
      tags: ['couro', 'restauro'],
      status: 'published',
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toEqual({
        slug: 'work-slug',
        title: 'Work title',
        description: 'Work description',
        category: 'bancos',
        tags: ['couro', 'restauro'],
        status: 'published',
      });
    }
  });

  it('rejeita quando falta um campo obrigatório (title)', () => {
    const result = createWorkSchema.safeParse({
      slug: 'work-slug',
      description: 'Work description',
      category: 'bancos',
    });

    expect(result.success).toBe(false);
  });

  it('rejeita quando um campo tem tipo incorreto (title numérico)', () => {
    const result = createWorkSchema.safeParse({
      slug: 'work-slug',
      title: 123,
      description: 'Work description',
      category: 'bancos',
    });

    expect(result.success).toBe(false);
  });

  it('rejeita propriedade desconhecida (.strict())', () => {
    const result = createWorkSchema.safeParse({
      slug: 'work-slug',
      title: 'Work title',
      description: 'Work description',
      category: 'bancos',
      extraProperty: 'not allowed',
    });

    expect(result.success).toBe(false);
  });

  it('aplica default de tags vazias quando ausente', () => {
    const result = createWorkSchema.safeParse({
      slug: 'work-slug',
      title: 'Work title',
      description: 'Work description',
      category: 'bancos',
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.tags).toEqual([]);
    }
  });

  it('aplica default de status draft quando ausente', () => {
    const result = createWorkSchema.safeParse({
      slug: 'work-slug',
      title: 'Work title',
      description: 'Work description',
      category: 'bancos',
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.status).toBe('draft');
    }
  });

  it('rejeita tags que não sejam array (ex.: string)', () => {
    const result = createWorkSchema.safeParse({
      slug: 'work-slug',
      title: 'Work title',
      description: 'Work description',
      category: 'bancos',
      tags: 'couro',
    });

    expect(result.success).toBe(false);
  });

  it('rejeita status fora do enum permitido', () => {
    const result = createWorkSchema.safeParse({
      slug: 'work-slug',
      title: 'Work title',
      description: 'Work description',
      category: 'bancos',
      status: 'archived',
    });

    expect(result.success).toBe(false);
  });
});
