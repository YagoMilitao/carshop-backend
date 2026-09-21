import { MongoCommentRepository } from '../../../../src/infra/repositories/mongo-comment.repository';
import { HttpError } from '../../../../src/core/domain/application/ApplicationError/http-error';

jest.mock('../../../../src/data/models/comment.model', () => ({
  CommentModel: {
    create: jest.fn(),
    find: jest.fn(),
    findOne: jest.fn(),
    findOneAndUpdate: jest.fn(),
    deleteOne: jest.fn(),
    countDocuments: jest.fn(),
  },
}));

interface MockedCommentModel {
  CommentModel: {
    create: jest.Mock;
    find: jest.Mock;
    findOne: jest.Mock;
    findOneAndUpdate: jest.Mock;
    deleteOne: jest.Mock;
    countDocuments: jest.Mock;
  };
}

const commentModel = jest.requireMock<MockedCommentModel>(
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
        lean: () => commentDocuments,
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
      lean: () => ({
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
      lean: () => ({
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
      lean: () => ({
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
      lean: () => ({
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
          repository.findById(maliciousId as string),
        ).rejects.toThrow(HttpError);
        expect(commentModel.CommentModel.findOne).not.toHaveBeenCalled();
      },
    );

    it.each(maliciousIds)(
      'update rejeita id malicioso (%s) sem chamar findOneAndUpdate',
      async (_label, maliciousId) => {
        await expect(
          repository.update(maliciousId as string, {
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
          repository.deleteById(maliciousId as string),
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

  describe('listForModeration (CARSHOP-136)', () => {
    function mockFindChain(documents: unknown[]) {
      const sort = jest.fn().mockReturnThis();
      const skip = jest.fn().mockReturnThis();
      const limit = jest.fn().mockReturnThis();
      const lean = jest.fn().mockResolvedValue(documents);
      commentModel.CommentModel.find.mockReturnValue({
        sort,
        skip,
        limit,
        lean,
      });
      return { sort, skip, limit, lean };
    }

    function buildDocument(
      overrides: Partial<{
        id: string;
        status: 'PENDING' | 'APPROVED' | 'HIDDEN';
      }> = {},
    ) {
      return {
        id: overrides.id ?? 'comment-1',
        workId: 'work-1',
        authorName: 'Yago',
        content: 'Comentário',
        status: overrides.status ?? 'PENDING',
        createdAt: new Date('2024-01-01T00:00:00.000Z'),
        updatedAt: new Date('2024-01-01T00:00:00.000Z'),
      };
    }

    it.each(['PENDING', 'APPROVED', 'HIDDEN'] as const)(
      'filtra por status %s repassando o filtro ao CommentModel.find/countDocuments (AC-003, AC-004, AC-005)',
      async (status) => {
        const document = buildDocument({ status });
        mockFindChain([document]);
        commentModel.CommentModel.countDocuments.mockResolvedValue(1);

        const result = await repository.listForModeration({
          status,
          page: 1,
          limit: 20,
        });

        expect(commentModel.CommentModel.find).toHaveBeenCalledWith({
          status,
        });
        expect(commentModel.CommentModel.countDocuments).toHaveBeenCalledWith({
          status,
        });
        expect(result.items).toHaveLength(1);
        expect(result.items[0].status).toBe(status);
        expect(result.total).toBe(1);
      },
    );

    it('sempre retorna items: [] para HIDDEN quando não há comentários persistidos com esse status (AC-005)', async () => {
      mockFindChain([]);
      commentModel.CommentModel.countDocuments.mockResolvedValue(0);

      const result = await repository.listForModeration({
        status: 'HIDDEN',
        page: 1,
        limit: 20,
      });

      expect(result.items).toEqual([]);
      expect(result.total).toBe(0);
    });

    it('lista sem filtro de status quando não informado (AC-002, FR-003)', async () => {
      const documents = [buildDocument({ id: 'a', status: 'PENDING' })];
      mockFindChain(documents);
      commentModel.CommentModel.countDocuments.mockResolvedValue(1);

      await repository.listForModeration({ page: 1, limit: 20 });

      expect(commentModel.CommentModel.find).toHaveBeenCalledWith({});
      expect(commentModel.CommentModel.countDocuments).toHaveBeenCalledWith({});
    });

    it('ordena por createdAt desc e _id desc como desempate (AC-007, FR-005)', async () => {
      const { sort } = mockFindChain([]);
      commentModel.CommentModel.countDocuments.mockResolvedValue(0);

      await repository.listForModeration({ page: 1, limit: 20 });

      expect(sort).toHaveBeenCalledWith({ createdAt: -1, _id: -1 });
    });

    it('calcula o offset de paginação (skip) a partir de page/limit', async () => {
      const { skip, limit } = mockFindChain([]);
      commentModel.CommentModel.countDocuments.mockResolvedValue(0);

      await repository.listForModeration({ page: 3, limit: 10 });

      expect(skip).toHaveBeenCalledWith(20);
      expect(limit).toHaveBeenCalledWith(10);
    });

    it('calcula totalPages com arredondamento para cima (ceiling)', async () => {
      mockFindChain([]);
      commentModel.CommentModel.countDocuments.mockResolvedValue(21);

      const result = await repository.listForModeration({ page: 1, limit: 20 });

      expect(result.totalPages).toBe(2);
    });

    it('retorna totalPages mínimo de 1 quando não há resultados', async () => {
      mockFindChain([]);
      commentModel.CommentModel.countDocuments.mockResolvedValue(0);

      const result = await repository.listForModeration({ page: 1, limit: 20 });

      expect(result.totalPages).toBe(1);
    });

    it('rejeita status de filtro fora do conjunto permitido sem consultar o CommentModel (AC-006, FR-004)', async () => {
      await expect(
        repository.listForModeration({
          status: 'INVALID' as never,
          page: 1,
          limit: 20,
        }),
      ).rejects.toThrow(HttpError);
      expect(commentModel.CommentModel.find).not.toHaveBeenCalled();
      expect(commentModel.CommentModel.countDocuments).not.toHaveBeenCalled();
    });

    it.each([
      ['page', { page: 0, limit: 20 }],
      ['page negativo', { page: -1, limit: 20 }],
      ['page não inteiro', { page: 1.5, limit: 20 }],
      ['limit', { page: 1, limit: 0 }],
      ['limit negativo', { page: 1, limit: -5 }],
    ])(
      'rejeita %s inválido sem consultar o CommentModel',
      async (_label, input) => {
        await expect(
          repository.listForModeration(input as never),
        ).rejects.toThrow(HttpError);
        expect(commentModel.CommentModel.find).not.toHaveBeenCalled();
        expect(commentModel.CommentModel.countDocuments).not.toHaveBeenCalled();
      },
    );

    it('as rejeições de listForModeration ocorrem com status HTTP 400', async () => {
      await expect(
        repository.listForModeration({
          status: 'INVALID' as never,
          page: 1,
          limit: 20,
        }),
      ).rejects.toMatchObject({ statusCode: 400 });
    });
  });
});
