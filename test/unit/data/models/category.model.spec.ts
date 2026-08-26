import { randomUUID } from 'crypto';
import { expect, describe, it } from '@jest/globals';
import { CategoryModel } from '../../../../src/data/models/category.model';

function buildValidCategory() {
  return {
    id: randomUUID(),
    name: 'Bancos',
    slug: `bancos-${randomUUID()}`,
  };
}

describe('CategoryModel', () => {
  it('deve validar uma categoria válida', async () => {
    const document = new CategoryModel(buildValidCategory());

    await expect(document.validate()).resolves.toBeUndefined();
    expect(document.name).toBe('Bancos');
    expect(document.deletedAt).toBeNull();
  });

  it('deve normalizar o slug para minúsculo', async () => {
    const document = new CategoryModel({
      ...buildValidCategory(),
      slug: 'BANCOS-TESTE',
    });

    await document.validate();

    expect(document.slug).toBe('bancos-teste');
  });

  it('deve exigir campos obrigatórios', async () => {
    const category = buildValidCategory();
    const withoutName = { ...category } as Partial<typeof category>;
    delete withoutName.name;
    const document = new CategoryModel(withoutName);

    await expect(document.validate()).rejects.toThrow();
  });

  it('deve definir índice único para slug', () => {
    const slugPath = CategoryModel.schema.path('slug') as {
      options?: { unique?: boolean };
    };

    expect(slugPath.options?.unique).toBe(true);
  });
});
