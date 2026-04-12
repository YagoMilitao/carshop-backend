import { randomUUID } from 'crypto';
import { expect, describe, it } from '@jest/globals';
import { PortfolioWorkModel } from '../../../../src/data/models/portfolio-work';

function buildValidWork() {
  return {
    id: randomUUID(),
    slug: `portfolio-${randomUUID()}`,
    title: 'Reforma de banco em couro do Civic',
    description: 'Troca completa do revestimento dos bancos.',
    category: 'bancos',
    tags: ['couro', 'honda', 'civic'],
    images: [
      {
        url: 'https://exemplo.com/capa.jpg',
        alt: 'Banco reformado',
        isCover: true,
      },
    ],
    metadata: {
      vehicleBrand: 'Honda',
      vehicleModel: 'Civic',
    },
    status: 'published' as const,
  };
}

describe('PortfolioWorkModel', () => {
  it('deve validar um trabalho válido', async () => {
    const document = new PortfolioWorkModel(buildValidWork());

    await expect(document.validate()).resolves.toBeUndefined();
    expect(document.title).toBe('Reforma de banco em couro do Civic');
    expect(document.category).toBe('bancos');
    expect(document.status).toBe('published');
    expect(document.images).toHaveLength(1);
  });

  it('deve normalizar tags para minúsculo e sem espaços', async () => {
    const document = new PortfolioWorkModel({
      ...buildValidWork(),
      tags: [' Couro ', 'HONDA', ' civic '],
      status: 'draft' as const,
    });

    await document.validate();

    expect(document.tags).toEqual(['couro', 'honda', 'civic']);
  });

  it('deve rejeitar mais de uma imagem de capa', async () => {
    const document = new PortfolioWorkModel({
      ...buildValidWork(),
      images: [
        {
          url: 'https://exemplo.com/1.jpg',
          alt: 'Imagem 1',
          isCover: true,
        },
        {
          url: 'https://exemplo.com/2.jpg',
          alt: 'Imagem 2',
          isCover: true,
        },
      ],
      status: 'draft' as const,
    });

    await expect(document.validate()).rejects.toThrow(
      'O trabalho pode ter no máximo uma imagem de capa.',
    );
  });

  it('deve rejeitar status inválido', async () => {
    const document = new PortfolioWorkModel({
      ...buildValidWork(),
      status: 'ativo',
    });

    await expect(document.validate()).rejects.toThrow();
  });

  it('deve exigir campos obrigatórios', async () => {
    const work = buildValidWork();
    const withoutTitle = { ...work } as Partial<typeof work>;
    delete withoutTitle.title;
    const document = new PortfolioWorkModel(withoutTitle);

    await expect(document.validate()).rejects.toThrow();
  });

  it('deve definir índice único para slug', () => {
    const slugPath = PortfolioWorkModel.schema.path('slug') as {
      options?: { unique?: boolean };
    };

    expect(slugPath.options?.unique).toBe(true);

    const hasUniqueSlugIndex = PortfolioWorkModel.schema
      .indexes()
      .some(([fields, options]) => {
        const typedFields = fields as Record<string, unknown>;
        const typedOptions = (options ?? {}) as { unique?: boolean };

        return typedFields.slug === 1 && typedOptions.unique === true;
      });

    expect(hasUniqueSlugIndex).toBe(true);
  });
});
