import { randomUUID } from 'crypto';
import { expect, describe, it } from '@jest/globals';
import { TagModel } from '../../../../src/data/models/tag.model';

function buildValidTag() {
  return {
    id: randomUUID(),
    name: 'Couro',
    slug: `couro-${randomUUID()}`,
  };
}

describe('TagModel', () => {
  it('deve validar uma tag válida', async () => {
    const document = new TagModel(buildValidTag());

    await expect(document.validate()).resolves.toBeUndefined();
    expect(document.name).toBe('Couro');
    expect(document.deletedAt).toBeNull();
  });

  it('deve normalizar o slug para minúsculo', async () => {
    const document = new TagModel({
      ...buildValidTag(),
      slug: 'COURO-TESTE',
    });

    await document.validate();

    expect(document.slug).toBe('couro-teste');
  });

  it('deve exigir campos obrigatórios', async () => {
    const tag = buildValidTag();
    const withoutName = { ...tag } as Partial<typeof tag>;
    delete withoutName.name;
    const document = new TagModel(withoutName);

    await expect(document.validate()).rejects.toThrow();
  });

  it('deve definir índice único para slug', () => {
    const slugPath = TagModel.schema.path('slug') as {
      options?: { unique?: boolean };
    };

    expect(slugPath.options?.unique).toBe(true);
  });
});
