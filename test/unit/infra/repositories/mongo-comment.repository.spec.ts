import { MongoCommentRepository } from '../../../../src/infra/repositories/mongo-comment.repository';

jest.mock('../../../../src/data/models/comment.model', () => ({
  CommentModel: {
    create: jest.fn(),
    find: jest.fn(),
    findOne: jest.fn(),
    findOneAndUpdate: jest.fn(),
    deleteOne: jest.fn(),
  },
}));

const commentModel = jest.requireMock(
  '../../../../src/data/models/comment.model',
);

describe('MongoCommentRepository', () => {
  const repository = new MongoCommentRepository();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('deve criar comentário como PENDING', async () => {
    const createdAt = new Date('2024-01-01T00:00:00.000Z');
    const updatedAt = new Date('2024-01-01T00:00:00.000Z');

    commentModel.CommentModel.create.mockResolvedValue({
      id: 'uuid-1',
      workId: 'work-1',
      authorName: 'Yago',
      content: 'Muito bom.',
      status: 'PENDING',
      createdAt,
      updatedAt,
    });

    const comment = await repository.createPending({
      workId: 'work-1',
      authorName: 'Yago',
      content: 'Muito bom.',
    });

    expect(commentModel.CommentModel.create).toHaveBeenCalledWith(
      expect.objectContaining({
        workId: 'work-1',
        authorName: 'Yago',
        content: 'Muito bom.',
        status: 'PENDING',
      }),
    );
    expect(comment.id).toBeDefined();
    expect(comment.status).toBe('PENDING');
  });

  it('deve listar apenas comentários APPROVED', async () => {
    const commentDocuments = [
      {
        id: 'comment-1',
        workId: 'work-1',
        authorName: 'Yago',
        content: 'Aprovado',
        status: 'APPROVED',
        createdAt: new Date('2024-01-01T00:00:00.000Z'),
        updatedAt: new Date('2024-01-01T00:00:00.000Z'),
      },
    ];

    commentModel.CommentModel.find.mockReturnValue({
      sort: () => ({
        lean: async () => commentDocuments,
      }),
    });

    const comments = await repository.listApprovedByWorkId('work-1');

    expect(commentModel.CommentModel.find).toHaveBeenCalledWith({
      workId: 'work-1',
      status: 'APPROVED',
    });
    expect(comments).toHaveLength(1);
    expect(comments[0].status).toBe('APPROVED');
  });

  it('deve atualizar comentário', async () => {
    commentModel.CommentModel.findOneAndUpdate.mockReturnValue({
      lean: async () => ({
        id: 'comment-1',
        workId: 'work-1',
        authorName: 'Yago',
        content: 'Atualizado',
        status: 'APPROVED',
        createdAt: new Date('2024-01-01T00:00:00.000Z'),
        updatedAt: new Date('2024-01-02T00:00:00.000Z'),
      }),
    });

    const updated = await repository.update('comment-1', {
      content: 'Atualizado',
    });

    expect(commentModel.CommentModel.findOneAndUpdate).toHaveBeenCalledWith(
      { id: 'comment-1' },
      { content: 'Atualizado' },
      { new: true },
    );
    expect(updated?.content).toBe('Atualizado');
  });

  it('deve deletar comentário', async () => {
    await repository.deleteById('comment-1');

    expect(commentModel.CommentModel.deleteOne).toHaveBeenCalledWith({
      id: 'comment-1',
    });
  });
});
