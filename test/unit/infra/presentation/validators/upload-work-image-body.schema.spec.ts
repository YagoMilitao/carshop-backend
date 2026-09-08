import { uploadWorkImageBodySchema } from '../../../../../src/infra/presentation/validators/upload-work-image-body.schema';

describe('uploadWorkImageBodySchema', () => {
  it('aceita um payload válido com alt e isCover (happy path)', () => {
    const result = uploadWorkImageBodySchema.safeParse({
      alt: 'Descrição da imagem',
      isCover: 'true',
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toEqual({
        alt: 'Descrição da imagem',
        isCover: 'true',
      });
    }
  });

  it('aceita payload vazio, pois alt e isCover são ambos opcionais', () => {
    const result = uploadWorkImageBodySchema.safeParse({});

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.alt).toBeUndefined();
      expect(result.data.isCover).toBeUndefined();
    }
  });

  it('aceita apenas alt informado, sem isCover', () => {
    const result = uploadWorkImageBodySchema.safeParse({
      alt: 'Somente alt',
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.alt).toBe('Somente alt');
      expect(result.data.isCover).toBeUndefined();
    }
  });

  it('aceita apenas isCover informado, sem alt', () => {
    const result = uploadWorkImageBodySchema.safeParse({
      isCover: 'false',
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.alt).toBeUndefined();
      expect(result.data.isCover).toBe('false');
    }
  });

  it('rejeita propriedade desconhecida (.strict())', () => {
    const result = uploadWorkImageBodySchema.safeParse({
      alt: 'Descrição',
      isCover: 'true',
      unknownField: 'not allowed',
    });

    expect(result.success).toBe(false);
  });

  it('rejeita alt com tipo incorreto (número)', () => {
    const result = uploadWorkImageBodySchema.safeParse({
      alt: 123,
    });

    expect(result.success).toBe(false);
  });
});
