import { toPublicWorkResponse } from '../../../../src/presentation/helpers/work-response.mapper';
import type { Work } from '../../../../src/core/domain/application/Work/work.types';

const work: Work = {
  id: 'work-1',
  slug: 'work-slug',
  title: 'Work title',
  description: 'Work description',
  category: 'bancos',
  tags: ['couro'],
  images: [
    {
      id: 'image-1',
      url: 'https://cdn.example.com/image-1.png',
      publicId: 'carshop/works/work-1/image-1',
      alt: 'Imagem',
      isCover: true,
      order: 0,
      createdAt: '2024-01-01T00:00:00.000Z',
      updatedAt: '2024-01-01T00:00:00.000Z',
    },
    {
      id: 'image-2',
      url: 'https://cdn.example.com/image-2.png',
      publicId: 'carshop/works/work-1/image-2',
      alt: 'Imagem 2',
      isCover: false,
      order: 1,
      createdAt: '2024-01-01T00:00:00.000Z',
      updatedAt: '2024-01-01T00:00:00.000Z',
    },
  ],
  status: 'published',
  deletedAt: null,
  createdAt: '2024-01-01T00:00:00.000Z',
  updatedAt: '2024-01-01T00:00:00.000Z',
};

describe('toPublicWorkResponse (FR-006, FR-007)', () => {
  it('remove deletedAt do nível superior', () => {
    const result = toPublicWorkResponse(work);

    expect(result).not.toHaveProperty('deletedAt');
  });

  it('remove publicId de cada imagem', () => {
    const result = toPublicWorkResponse(work);

    expect(result.images).toHaveLength(2);
    result.images.forEach((image) => {
      expect(image).not.toHaveProperty('publicId');
    });
  });

  it('preserva os demais campos inalterados', () => {
    const result = toPublicWorkResponse(work);

    expect(result).toMatchObject({
      id: 'work-1',
      slug: 'work-slug',
      title: 'Work title',
      description: 'Work description',
      category: 'bancos',
      tags: ['couro'],
      status: 'published',
      createdAt: '2024-01-01T00:00:00.000Z',
      updatedAt: '2024-01-01T00:00:00.000Z',
    });
    expect(result.images[0]).toMatchObject({
      id: 'image-1',
      url: 'https://cdn.example.com/image-1.png',
      alt: 'Imagem',
      isCover: true,
      order: 0,
      createdAt: '2024-01-01T00:00:00.000Z',
      updatedAt: '2024-01-01T00:00:00.000Z',
    });
  });

  it('não muta o objeto original', () => {
    const original = JSON.parse(JSON.stringify(work)) as Work;

    toPublicWorkResponse(work);

    expect(work).toEqual(original);
  });

  it('lida com uma lista de imagens vazia', () => {
    const workWithoutImages: Work = { ...work, images: [] };

    const result = toPublicWorkResponse(workWithoutImages);

    expect(result.images).toEqual([]);
  });
});
