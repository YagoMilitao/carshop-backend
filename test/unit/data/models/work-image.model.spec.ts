import { randomUUID } from 'crypto';
import { expect, describe, it } from '@jest/globals';
import { WorkImageModel } from '../../../../src/data/models/work-image.model';

function buildValidWorkImage() {
  return {
    id: randomUUID(),
    workId: randomUUID(),
    url: 'https://exemplo.com/imagem.jpg',
    alt: 'Banco reformado',
  };
}

describe('WorkImageModel', () => {
  it('deve validar uma imagem de trabalho válida', async () => {
    const document = new WorkImageModel(buildValidWorkImage());

    await expect(document.validate()).resolves.toBeUndefined();
    expect(document.isCover).toBe(false);
  });

  it('deve exigir campos obrigatórios', async () => {
    const image = buildValidWorkImage();
    const withoutUrl = { ...image } as Partial<typeof image>;
    delete withoutUrl.url;
    const document = new WorkImageModel(withoutUrl);

    await expect(document.validate()).rejects.toThrow();
  });

  it('deve definir índice único para id', () => {
    const idPath = WorkImageModel.schema.path('id') as {
      options?: { unique?: boolean };
    };

    expect(idPath.options?.unique).toBe(true);
  });
});
