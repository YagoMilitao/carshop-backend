jest.mock('node:crypto', () => ({
  randomUUID: jest.fn(() => 'uuid-1'),
}));

import { MongoWorkRepository } from '../../../../src/infra/repositories/mongo-work.repository';
import { HttpError } from '../../../../src/core/domain/application/ApplicationError/http-error';

jest.mock('../../../../src/data/models/work.model', () => ({
  WorkModel: {
    create: jest.fn(),
    findOne: jest.fn(),
    find: jest.fn(),
    updateOne: jest.fn(),
    deleteOne: jest.fn(),
  },
}));

jest.mock('../../../../src/data/models/comment.model', () => ({
  CommentModel: {
    deleteMany: jest.fn(),
  },
}));

const workModel = jest.requireMock('../../../../src/data/models/work.model');

const commentModel = jest.requireMock(
  '../../../../src/data/models/comment.model',
);

describe('MongoWorkRepository', () => {
  const repository = new MongoWorkRepository();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('deve criar um work', async () => {
    const createdAt = new Date('2024-01-01T00:00:00.000Z');
    const updatedAt = new Date('2024-01-01T00:00:00.000Z');

    workModel.WorkModel.create.mockResolvedValue({
      id: 'uuid-1',
      slug: 'teste-work',
      title: 'Teste Work',
      description: 'Descrição teste',
      category: 'bancos',
      tags: ['Couro', 'Civic'],
      status: 'published',
      createdAt,
      updatedAt,
    });

    const work = await repository.create({
      slug: 'teste-work',
      title: 'Teste Work',
      description: 'Descrição teste',
      category: 'bancos',
      tags: ['Couro', 'Civic'],
      status: 'published',
    });

    expect(workModel.WorkModel.create).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'uuid-1',
        slug: 'teste-work',
        title: 'Teste Work',
        description: 'Descrição teste',
        category: 'bancos',
        tags: ['Couro', 'Civic'],
        status: 'published',
        metadata: {},
        seo: {},
        deletedAt: null,
        publishedAt: expect.any(Date),
      }),
    );
    expect(work.id).toBe('uuid-1');
    expect(work.slug).toBe('teste-work');
    expect(work.status).toBe('published');
  });

  it('deve listar apenas works publicados', async () => {
    const workDocuments = [
      {
        id: 'work-1',
        slug: 'publicado',
        title: 'Publicado',
        description: 'Descrição',
        category: 'bancos',
        tags: [],
        status: 'published',
        createdAt: new Date('2024-01-01T00:00:00.000Z'),
        updatedAt: new Date('2024-01-01T00:00:00.000Z'),
      },
    ];

    workModel.WorkModel.find.mockReturnValue({
      sort: () => ({
        lean: async () => workDocuments,
      }),
    });

    const works = await repository.listPublished();

    expect(workModel.WorkModel.find).toHaveBeenCalledWith({
      status: 'published',
      deletedAt: null,
    });
    expect(works).toHaveLength(1);
    expect(works[0].slug).toBe('publicado');
  });

  it('deve aplicar soft delete', async () => {
    const workId = 'work-1';

    await repository.softDelete(workId);

    expect(workModel.WorkModel.updateOne).toHaveBeenCalledWith(
      { id: workId, deletedAt: null },
      { deletedAt: expect.any(Date) },
    );
  });

  it('deve fazer hard delete', async () => {
    const workId = 'work-1';

    await repository.hardDelete(workId);

    expect(workModel.WorkModel.deleteOne).toHaveBeenCalledWith({ id: workId });
    expect(commentModel.CommentModel.deleteMany).toHaveBeenCalledWith({
      workId,
    });
  });

  it('ao adicionar uma imagem de capa, remove a capa das demais antes de inserir a nova (AC-008, FR-007)', async () => {
    const workId = 'work-1';
    const newImage = {
      id: 'image-2',
      url: 'https://cdn.example.com/image-2.png',
      publicId: 'carshop/works/work-1/image-2',
      alt: 'Nova capa',
      isCover: true,
      order: 1,
      createdAt: '',
      updatedAt: '',
    };

    workModel.WorkModel.updateOne.mockResolvedValue({ acknowledged: true });
    workModel.WorkModel.findOne.mockReturnValue({
      lean: async () => ({
        id: workId,
        slug: 'work-slug',
        title: 'Work title',
        description: 'Work description',
        category: 'bancos',
        tags: [],
        images: [newImage],
        status: 'draft',
        deletedAt: null,
        createdAt: new Date('2024-01-01T00:00:00.000Z'),
        updatedAt: new Date('2024-01-01T00:00:00.000Z'),
      }),
    });

    await repository.addImage(workId, newImage);

    expect(workModel.WorkModel.updateOne).toHaveBeenNthCalledWith(
      1,
      { id: workId },
      { $set: { 'images.$[].isCover': false } },
    );
    expect(workModel.WorkModel.updateOne).toHaveBeenNthCalledWith(
      2,
      { id: workId, deletedAt: null },
      { $push: { images: newImage } },
    );
  });

  it('ao adicionar uma imagem que não é capa, não altera as capas existentes', async () => {
    const workId = 'work-1';
    const newImage = {
      id: 'image-3',
      url: 'https://cdn.example.com/image-3.png',
      publicId: 'carshop/works/work-1/image-3',
      alt: 'Imagem extra',
      isCover: false,
      order: 2,
      createdAt: '',
      updatedAt: '',
    };

    workModel.WorkModel.updateOne.mockResolvedValue({ acknowledged: true });
    workModel.WorkModel.findOne.mockReturnValue({
      lean: async () => ({
        id: workId,
        slug: 'work-slug',
        title: 'Work title',
        description: 'Work description',
        category: 'bancos',
        tags: [],
        images: [newImage],
        status: 'draft',
        deletedAt: null,
        createdAt: new Date('2024-01-01T00:00:00.000Z'),
        updatedAt: new Date('2024-01-01T00:00:00.000Z'),
      }),
    });

    await repository.addImage(workId, newImage);

    expect(workModel.WorkModel.updateOne).toHaveBeenCalledTimes(1);
    expect(workModel.WorkModel.updateOne).toHaveBeenCalledWith(
      { id: workId, deletedAt: null },
      { $push: { images: newImage } },
    );
  });

  it('deve remover a imagem do work via $pull, escopado por workId e imageId', async () => {
    const workId = 'work-1';
    const imageId = 'image-1';

    workModel.WorkModel.updateOne.mockResolvedValue({ acknowledged: true });

    await repository.removeImage(workId, imageId);

    expect(workModel.WorkModel.updateOne).toHaveBeenCalledWith(
      { id: workId },
      {
        $pull: {
          images: { id: imageId },
        },
      },
    );
  });

  describe('métodos de busca/remoção por identificador válido (AC-001, FR-002)', () => {
    it('findById consulta o WorkModel com o id validado e deletedAt: null', async () => {
      const workId = 'work-1';

      workModel.WorkModel.findOne.mockReturnValue({
        lean: async () => ({
          id: workId,
          slug: 'work-slug',
          title: 'Work title',
          description: 'Work description',
          category: 'bancos',
          tags: [],
          images: [],
          status: 'published',
          deletedAt: null,
          createdAt: new Date('2024-01-01T00:00:00.000Z'),
          updatedAt: new Date('2024-01-01T00:00:00.000Z'),
        }),
      });

      const work = await repository.findById(workId);

      expect(workModel.WorkModel.findOne).toHaveBeenCalledWith({
        id: workId,
        deletedAt: null,
      });
      expect(work?.id).toBe(workId);
    });

    it('findById retorna undefined quando o WorkModel não encontra o work', async () => {
      workModel.WorkModel.findOne.mockReturnValue({
        lean: async () => null,
      });

      const work = await repository.findById('work-inexistente');

      expect(work).toBeUndefined();
    });

    it('findBySlug consulta o WorkModel com o slug validado e deletedAt: null', async () => {
      const slug = 'work-slug';

      workModel.WorkModel.findOne.mockReturnValue({
        lean: async () => ({
          id: 'work-1',
          slug,
          title: 'Work title',
          description: 'Work description',
          category: 'bancos',
          tags: [],
          images: [],
          status: 'published',
          deletedAt: null,
          createdAt: new Date('2024-01-01T00:00:00.000Z'),
          updatedAt: new Date('2024-01-01T00:00:00.000Z'),
        }),
      });

      const work = await repository.findBySlug(slug);

      expect(workModel.WorkModel.findOne).toHaveBeenCalledWith({
        slug,
        deletedAt: null,
      });
      expect(work?.slug).toBe(slug);
    });

    it('findByIdIncludingDeleted consulta o WorkModel apenas pelo id, sem filtrar deletedAt', async () => {
      const workId = 'work-1';

      workModel.WorkModel.findOne.mockReturnValue({
        lean: async () => ({
          id: workId,
          slug: 'work-slug',
          title: 'Work title',
          description: 'Work description',
          category: 'bancos',
          tags: [],
          images: [],
          status: 'draft',
          deletedAt: new Date('2024-02-01T00:00:00.000Z'),
          createdAt: new Date('2024-01-01T00:00:00.000Z'),
          updatedAt: new Date('2024-01-01T00:00:00.000Z'),
        }),
      });

      const work = await repository.findByIdIncludingDeleted(workId);

      expect(workModel.WorkModel.findOne).toHaveBeenCalledWith({ id: workId });
      expect(work?.id).toBe(workId);
      expect(work?.deletedAt).toBe('2024-02-01T00:00:00.000Z');
    });

    it('hardDeleteData remove o work pelo id validado e retorna true quando um documento é removido', async () => {
      const workId = 'work-1';

      workModel.WorkModel.deleteOne.mockResolvedValue({ deletedCount: 1 });

      const result = await repository.hardDeleteData(workId);

      expect(workModel.WorkModel.deleteOne).toHaveBeenCalledWith({
        id: workId,
      });
      expect(result).toBe(true);
    });

    it('hardDeleteData retorna false quando nenhum documento é removido', async () => {
      workModel.WorkModel.deleteOne.mockResolvedValue({ deletedCount: 0 });

      const result = await repository.hardDeleteData('work-inexistente');

      expect(result).toBe(false);
    });
  });

  describe('listDeletedBefore', () => {
    it('consulta works soft-deletados com deletedAt não nulo e <= cutoffDate, ordenados por deletedAt asc, mapeados via toWork (FR-001, NFR-005)', async () => {
      const cutoffDate = new Date('2024-01-01T00:00:00.000Z');
      const sortMock = jest.fn();
      const leanMock = jest.fn();

      const workDocuments = [
        {
          id: 'work-1',
          slug: 'work-antigo',
          title: 'Work antigo',
          description: 'Descrição',
          category: 'bancos',
          tags: [],
          images: [],
          status: 'draft',
          deletedAt: new Date('2023-12-01T00:00:00.000Z'),
          createdAt: new Date('2023-01-01T00:00:00.000Z'),
          updatedAt: new Date('2023-01-01T00:00:00.000Z'),
        },
      ];

      leanMock.mockResolvedValue(workDocuments);
      sortMock.mockReturnValue({ lean: leanMock });
      workModel.WorkModel.find.mockReturnValue({ sort: sortMock });

      const works = await repository.listDeletedBefore(cutoffDate);

      expect(workModel.WorkModel.find).toHaveBeenCalledWith({
        deletedAt: { $ne: null, $lte: cutoffDate },
      });
      expect(sortMock).toHaveBeenCalledWith({ deletedAt: 1 });
      expect(leanMock).toHaveBeenCalled();
      expect(works).toHaveLength(1);
      expect(works[0]).toMatchObject({
        id: 'work-1',
        slug: 'work-antigo',
        deletedAt: '2023-12-01T00:00:00.000Z',
      });
    });

    it('retorna lista vazia quando nenhum work satisfaz o critério (AC-007)', async () => {
      const cutoffDate = new Date('2024-01-01T00:00:00.000Z');

      workModel.WorkModel.find.mockReturnValue({
        sort: () => ({
          lean: () => Promise.resolve([]),
        }),
      });

      const works = await repository.listDeletedBefore(cutoffDate);

      expect(workModel.WorkModel.find).toHaveBeenCalledWith({
        deletedAt: { $ne: null, $lte: cutoffDate },
      });
      expect(works).toEqual([]);
    });
  });

  describe('rejeição de identificadores não-string (AC-002, AC-003, FR-001, FR-003)', () => {
    const unsafeIdentifier = { $ne: null } as unknown as string;

    it('findById rejeita id não-string sem consultar o WorkModel', async () => {
      await expect(repository.findById(unsafeIdentifier)).rejects.toThrow(
        HttpError,
      );
      expect(workModel.WorkModel.findOne).not.toHaveBeenCalled();
    });

    it('findByIdIncludingDeleted rejeita id não-string sem consultar o WorkModel', async () => {
      await expect(
        repository.findByIdIncludingDeleted(unsafeIdentifier),
      ).rejects.toThrow(HttpError);
      expect(workModel.WorkModel.findOne).not.toHaveBeenCalled();
    });

    it('findBySlug rejeita slug não-string sem consultar o WorkModel', async () => {
      await expect(repository.findBySlug(unsafeIdentifier)).rejects.toThrow(
        HttpError,
      );
      expect(workModel.WorkModel.findOne).not.toHaveBeenCalled();
    });

    it('softDelete rejeita id não-string sem chamar updateOne', async () => {
      await expect(repository.softDelete(unsafeIdentifier)).rejects.toThrow(
        HttpError,
      );
      expect(workModel.WorkModel.updateOne).not.toHaveBeenCalled();
    });

    it('hardDelete rejeita id não-string sem chamar deleteOne/deleteMany', async () => {
      await expect(repository.hardDelete(unsafeIdentifier)).rejects.toThrow(
        HttpError,
      );
      expect(workModel.WorkModel.deleteOne).not.toHaveBeenCalled();
      expect(commentModel.CommentModel.deleteMany).not.toHaveBeenCalled();
    });

    it('hardDeleteData rejeita id não-string sem chamar deleteOne', async () => {
      await expect(repository.hardDeleteData(unsafeIdentifier)).rejects.toThrow(
        HttpError,
      );
      expect(workModel.WorkModel.deleteOne).not.toHaveBeenCalled();
    });

    it('addImage rejeita workId não-string sem chamar updateOne', async () => {
      const newImage = {
        id: 'image-1',
        url: 'https://cdn.example.com/image-1.png',
        publicId: 'carshop/works/work-1/image-1',
        alt: 'Imagem',
        isCover: false,
        order: 0,
        createdAt: '',
        updatedAt: '',
      };

      await expect(
        repository.addImage(unsafeIdentifier, newImage),
      ).rejects.toThrow(HttpError);
      expect(workModel.WorkModel.updateOne).not.toHaveBeenCalled();
    });

    it('removeImage rejeita workId não-string sem chamar updateOne', async () => {
      await expect(
        repository.removeImage(unsafeIdentifier, 'image-1'),
      ).rejects.toThrow(HttpError);
      expect(workModel.WorkModel.updateOne).not.toHaveBeenCalled();
    });

    it('removeImage rejeita imageId não-string sem chamar updateOne', async () => {
      await expect(
        repository.removeImage('work-1', unsafeIdentifier),
      ).rejects.toThrow(HttpError);
      expect(workModel.WorkModel.updateOne).not.toHaveBeenCalled();
    });

    it('as rejeições ocorrem com status HTTP 400', async () => {
      await expect(repository.findById(unsafeIdentifier)).rejects.toMatchObject(
        { statusCode: 400 },
      );
    });
  });
});
