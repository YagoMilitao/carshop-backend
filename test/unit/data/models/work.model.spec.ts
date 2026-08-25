import { randomUUID } from 'crypto';
import { expect, describe, it } from '@jest/globals';
import { WorkModel } from '../../../../src/data/models/work.model';

function buildValidWork() {
  return {
    id: randomUUID(),
    slug: `work-${randomUUID()}`,
    title: 'Reforma de banco em couro',
    description: 'Troca completa do revestimento dos bancos.',
    category: 'bancos',
    tags: ['couro', 'honda', 'civic'],
    images: [
      {
        id: randomUUID(),
        url: 'https://exemplo.com/capa.jpg',
        publicId: 'public-id-1',
        alt: 'Banco reformado',
        isCover: true,
        order: 0,
      },
    ],
  };
}

describe('WorkModel', () => {
  it('deve validar um trabalho válido', async () => {
    const document = new WorkModel(buildValidWork());

    await expect(document.validate()).resolves.toBeUndefined();
    expect(document.status).toBe('draft');
    expect(document.deletedAt).toBeNull();
  });

  it('deve rejeitar mais de uma imagem de capa', async () => {
    const document = new WorkModel({
      ...buildValidWork(),
      images: [
        {
          id: randomUUID(),
          url: 'https://exemplo.com/1.jpg',
          publicId: 'public-id-1',
          alt: 'Imagem 1',
          isCover: true,
          order: 0,
        },
        {
          id: randomUUID(),
          url: 'https://exemplo.com/2.jpg',
          publicId: 'public-id-2',
          alt: 'Imagem 2',
          isCover: true,
          order: 1,
        },
      ],
    });

    await expect(document.validate()).rejects.toThrow(
      'O trabalho pode ter no máximo uma imagem de capa.',
    );
  });

  it('deve rejeitar status inválido', async () => {
    const document = new WorkModel({
      ...buildValidWork(),
      status: 'ativo',
    });

    await expect(document.validate()).rejects.toThrow();
  });

  it('deve exigir campos obrigatórios', async () => {
    const work = buildValidWork();
    const withoutTitle = { ...work } as Partial<typeof work>;
    delete withoutTitle.title;
    const document = new WorkModel(withoutTitle);

    await expect(document.validate()).rejects.toThrow();
  });

  it('deve normalizar tags e keywords, e ordenar imagens antes de salvar', async () => {
    const document = new WorkModel({
      ...buildValidWork(),
      tags: [' Couro ', 'HONDA', ' civic ', ''],
      seo: {
        keywords: [' Reforma ', 'COURO', ''],
      },
      images: [
        {
          id: randomUUID(),
          url: 'https://exemplo.com/2.jpg',
          publicId: 'public-id-2',
          alt: 'Imagem 2',
          isCover: false,
          order: 2,
        },
        {
          id: randomUUID(),
          url: 'https://exemplo.com/1.jpg',
          publicId: 'public-id-1',
          alt: 'Imagem 1',
          isCover: true,
          order: 1,
        },
      ],
    });

    await document.validate();

    // Mongoose does not expose a public API to invoke a `pre('save')`
    // middleware without an active DB connection. Reaching into the
    // internal hooks registry is the only way to exercise
    // `normalizeFields` deterministically in a unit test.
    type NormalizeFieldsHook = () => void;
    const preSaveHooks = (
      WorkModel.schema as unknown as {
        s: {
          hooks: { _pres: Map<string, Array<{ fn: NormalizeFieldsHook }>> };
        };
      }
    ).s.hooks._pres.get('save');

    expect(preSaveHooks).toBeDefined();
    preSaveHooks?.forEach((hook) => hook.fn.call(document));

    expect(document.tags).toEqual(['couro', 'honda', 'civic']);
    expect(document.seo?.keywords).toEqual(['reforma', 'couro']);
    expect(document.images.map((image) => image.order)).toEqual([1, 2]);
  });

  it('deve definir índice único para slug', () => {
    const slugPath = WorkModel.schema.path('slug') as {
      options?: { unique?: boolean };
    };

    expect(slugPath.options?.unique).toBe(true);
  });
});
