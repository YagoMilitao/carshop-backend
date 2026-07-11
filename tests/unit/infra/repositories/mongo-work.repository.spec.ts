jest.mock('crypto', () => ({
  randomUUID: jest.fn(() => 'uuid-1'),
}));

import { MongoWorkRepository } from '../../../../src/infra/repositories/mongo-work.repository';

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

const workModel = jest.requireMock(
  '../../../../src/data/models/work.model',
) as {
  WorkModel: {
    create: jest.Mock;
    findOne: jest.Mock;
    find: jest.Mock;
    updateOne: jest.Mock;
    deleteOne: jest.Mock;
  };
};

const commentModel = jest.requireMock(
  '../../../../src/data/models/comment.model',
) as {
  CommentModel: {
    deleteMany: jest.Mock;
  };
};

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
});
