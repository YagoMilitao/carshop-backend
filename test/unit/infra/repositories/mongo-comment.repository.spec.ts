import { MongoCommentRepository } from '../../../../src/infra/repositories/mongo-comment.repository';
import { HttpError } from '../../../../src/core/domain/application/ApplicationError/http-error';

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

  it('deve buscar comentário por id válido (AC-005)', async () => {
    commentModel.CommentModel.findOne.mockReturnValue({
      lean: async () => ({
        id: 'comment-1',
        workId: 'work-1',
        authorName: 'Yago',
        content: 'Aprovado',
        status: 'APPROVED',
        createdAt: new Date('2024-01-01T00:00:00.000Z'),
        updatedAt: new Date('2024-01-01T00:00:00.000Z'),
      }),
    });

    const comment = await repository.findById('comment-1');

    expect(commentModel.CommentModel.findOne).toHaveBeenCalledWith({
      id: 'comment-1',
    });
    expect(comment?.id).toBe('comment-1');
  });

  it('deve atualizar comentário com payload permitido (AC-004, AC-005)', async () => {
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
      { $set: { content: 'Atualizado' } },
      { new: true },
    );
    expect(updated?.content).toBe('Atualizado');
  });

  it('deve atualizar authorName e status quando informados (AC-004, AC-005)', async () => {
    commentModel.CommentModel.findOneAndUpdate.mockReturnValue({
      lean: async () => ({
        id: 'comment-1',
        workId: 'work-1',
        authorName: 'Novo Nome',
        content: 'Aprovado',
        status: 'APPROVED',
        createdAt: new Date('2024-01-01T00:00:00.000Z'),
        updatedAt: new Date('2024-01-02T00:00:00.000Z'),
      }),
    });

    await repository.update('comment-1', {
      authorName: 'Novo Nome',
      status: 'APPROVED',
    });

    expect(commentModel.CommentModel.findOneAndUpdate).toHaveBeenCalledWith(
      { id: 'comment-1' },
      { $set: { authorName: 'Novo Nome', status: 'APPROVED' } },
      { new: true },
    );
  });

  it('rejeita status fora do enum permitido sem chamar findOneAndUpdate', async () => {
    await expect(
      repository.update('comment-1', {
        status: 'REJECTED' as never,
      }),
    ).rejects.toThrow(HttpError);
    expect(commentModel.CommentModel.findOneAndUpdate).not.toHaveBeenCalled();
  });

  it('rejeita payload de atualização em formato de array sem chamar findOneAndUpdate', async () => {
    await expect(
      repository.update('comment-1', ['content'] as never),
    ).rejects.toThrow(HttpError);
    expect(commentModel.CommentModel.findOneAndUpdate).not.toHaveBeenCalled();
  });

  it('deve descartar campo extra não permitido mantendo apenas os campos conhecidos (FR-003)', async () => {
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

    await repository.update('comment-1', {
      content: 'Atualizado',
      unknownField: 'ignored',
    } as never);

    expect(commentModel.CommentModel.findOneAndUpdate).toHaveBeenCalledWith(
      { id: 'comment-1' },
      { $set: { content: 'Atualizado' } },
      { new: true },
    );
  });

  it('deve deletar comentário com id válido', async () => {
    await repository.deleteById('comment-1');

    expect(commentModel.CommentModel.deleteOne).toHaveBeenCalledWith({
      id: 'comment-1',
    });
  });

  describe('rejeição de identificadores maliciosos (AC-001, AC-006, FR-001, FR-002, FR-005)', () => {
    const maliciousIds: Array<[string, unknown]> = [
      ['objeto com operador', { $ne: null }],
      ['array', ['comment-1']],
      ['string vazia', ''],
      ['string com operador', '$ne'],
      ['string com ponto', 'a.b'],
      ['string sensível a prototype pollution', '__proto__'],
    ];

    it.each(maliciousIds)(
      'findById rejeita id malicioso (%s) sem consultar o CommentModel',
      async (_label, maliciousId) => {
        await expect(
          repository.findById(maliciousId as unknown as string),
        ).rejects.toThrow(HttpError);
        expect(commentModel.CommentModel.findOne).not.toHaveBeenCalled();
      },
    );

    it.each(maliciousIds)(
      'update rejeita id malicioso (%s) sem chamar findOneAndUpdate',
      async (_label, maliciousId) => {
        await expect(
          repository.update(maliciousId as unknown as string, {
            content: 'Atualizado',
          }),
        ).rejects.toThrow(HttpError);
        expect(
          commentModel.CommentModel.findOneAndUpdate,
        ).not.toHaveBeenCalled();
      },
    );

    it.each(maliciousIds)(
      'deleteById rejeita id malicioso (%s) sem chamar deleteOne',
      async (_label, maliciousId) => {
        await expect(
          repository.deleteById(maliciousId as unknown as string),
        ).rejects.toThrow(HttpError);
        expect(commentModel.CommentModel.deleteOne).not.toHaveBeenCalled();
      },
    );

    it('as rejeições de id ocorrem com status HTTP 400', async () => {
      await expect(
        repository.findById({ $ne: null } as unknown as string),
      ).rejects.toMatchObject({ statusCode: 400 });
    });
  });

  describe('rejeição de payloads maliciosos em update (AC-002, AC-003, AC-006, FR-003, FR-004)', () => {
    it('rejeita chave de operador de topo (ex.: $where) sem chamar findOneAndUpdate', async () => {
      await expect(
        repository.update('comment-1', {
          $where: 'this.content',
        } as never),
      ).rejects.toThrow(HttpError);
      expect(commentModel.CommentModel.findOneAndUpdate).not.toHaveBeenCalled();
    });

    it('rejeita valor com formato de operador em campo permitido (ex.: content: { $ne: null }) sem chamar findOneAndUpdate', async () => {
      await expect(
        repository.update('comment-1', {
          content: { $ne: null },
        } as never),
      ).rejects.toThrow(HttpError);
      expect(commentModel.CommentModel.findOneAndUpdate).not.toHaveBeenCalled();
    });

    it('rejeita chave com ponto (path aninhado) sem chamar findOneAndUpdate', async () => {
      await expect(
        repository.update('comment-1', {
          ...({ 'content.nested': 'x' } as Record<string, unknown>),
        } as never),
      ).rejects.toThrow(HttpError);
      expect(commentModel.CommentModel.findOneAndUpdate).not.toHaveBeenCalled();
    });

    it.each(['__proto__', 'constructor', 'prototype'])(
      'rejeita chave sensível a prototype pollution (%s) sem chamar findOneAndUpdate',
      async (dangerousKey) => {
        const payload: Record<string, unknown> = {};
        payload[dangerousKey] = { polluted: true };

        await expect(
          repository.update('comment-1', payload as never),
        ).rejects.toThrow(HttpError);
        expect(
          commentModel.CommentModel.findOneAndUpdate,
        ).not.toHaveBeenCalled();
      },
    );

    it('rejeita payload com protótipo customizado e não lê campos herdados', async () => {
      const payload = Object.create({
        authorName: 'Injected',
      }) as Record<string, unknown>;
      payload.content = 'Atualizado';

      await expect(
        repository.update('comment-1', payload as never),
      ).rejects.toThrow(HttpError);
      expect(commentModel.CommentModel.findOneAndUpdate).not.toHaveBeenCalled();
    });

    it('rejeita payload sem nenhum campo válido informado', async () => {
      await expect(repository.update('comment-1', {} as never)).rejects.toThrow(
        HttpError,
      );
      expect(commentModel.CommentModel.findOneAndUpdate).not.toHaveBeenCalled();
    });

    it('as rejeições de update ocorrem com status HTTP 400', async () => {
      await expect(
        repository.update('comment-1', { $where: 'this.content' } as never),
      ).rejects.toMatchObject({ statusCode: 400 });
    });
  });

  describe('validação de campos em createPending/listApprovedByWorkId (NFR-001)', () => {
    it('createPending rejeita workId não-string sem chamar CommentModel.create', async () => {
      await expect(
        repository.createPending({
          workId: { $ne: null } as unknown as string,
          authorName: 'Yago',
          content: 'Muito bom.',
        }),
      ).rejects.toThrow(HttpError);
      expect(commentModel.CommentModel.create).not.toHaveBeenCalled();
    });

    it('createPending rejeita authorName não-string sem chamar CommentModel.create', async () => {
      await expect(
        repository.createPending({
          workId: 'work-1',
          authorName: { $ne: null } as unknown as string,
          content: 'Muito bom.',
        }),
      ).rejects.toThrow(HttpError);
      expect(commentModel.CommentModel.create).not.toHaveBeenCalled();
    });

    it('createPending rejeita content não-string sem chamar CommentModel.create', async () => {
      await expect(
        repository.createPending({
          workId: 'work-1',
          authorName: 'Yago',
          content: { $ne: null } as unknown as string,
        }),
      ).rejects.toThrow(HttpError);
      expect(commentModel.CommentModel.create).not.toHaveBeenCalled();
    });

    it('listApprovedByWorkId rejeita workId malicioso sem chamar CommentModel.find', async () => {
      await expect(
        repository.listApprovedByWorkId({
          $ne: null,
        } as unknown as string),
      ).rejects.toThrow(HttpError);
      expect(commentModel.CommentModel.find).not.toHaveBeenCalled();
    });
  });
});
