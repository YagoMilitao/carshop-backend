import { CreateCommentUseCase } from '../../../src/usecase/create-comment.use-case';
import type { CommentRepositoryPort } from '../../../src/core/domain/repositories/comment.repository';
import type { WorkRepositoryPort } from '../../../src/core/domain/repositories/work.repository';
import type {
  Comment,
  Work,
} from '../../../src/core/domain/application/Work/work.types';

describe('CreateCommentUseCase', () => {
  const buildCommentRepository = (
    overrides: Partial<CommentRepositoryPort> = {},
  ): jest.Mocked<CommentRepositoryPort> =>
    ({
      createPending: jest.fn(),
      listApprovedByWorkId: jest.fn(),
      findById: jest.fn(),
      update: jest.fn(),
      deleteById: jest.fn(),
      ...overrides,
    }) as jest.Mocked<CommentRepositoryPort>;

  const buildWorkRepository = (
    overrides: Partial<WorkRepositoryPort> = {},
  ): jest.Mocked<WorkRepositoryPort> =>
    ({
      create: jest.fn(),
      findById: jest.fn(),
      findBySlug: jest.fn(),
      listPublished: jest.fn(),
      listAll: jest.fn(),
      softDelete: jest.fn(),
      hardDelete: jest.fn(),
      findByIdIncludingDeleted: jest.fn(),
      addImage: jest.fn(),
      removeImage: jest.fn(),
      hardDeleteData: jest.fn(),
      listDeletedBefore: jest.fn(),
      ...overrides,
    }) as jest.Mocked<WorkRepositoryPort>;

  const work: Work = {
    id: 'work-1',
    slug: 'work-slug',
    title: 'Work title',
    description: 'Work description',
    category: 'bancos',
    tags: [],
    images: [],
    status: 'published',
    deletedAt: null,
    createdAt: '2024-01-01T00:00:00.000Z',
    updatedAt: '2024-01-01T00:00:00.000Z',
  };

  const createdComment: Comment = {
    id: 'comment-1',
    workId: 'work-1',
    authorName: 'Maria',
    content: 'Ótimo trabalho!',
    status: 'PENDING',
    createdAt: '2024-01-01T00:00:00.000Z',
    updatedAt: '2024-01-01T00:00:00.000Z',
  };

  it('cria um comentário pendente quando o work existe', async () => {
    const workRepository = buildWorkRepository({
      findById: jest.fn().mockResolvedValue(work),
    });
    const commentRepository = buildCommentRepository({
      createPending: jest.fn().mockResolvedValue(createdComment),
    });

    const useCase = new CreateCommentUseCase(
      commentRepository,
      workRepository,
    );

    const result = await useCase.execute({
      workId: 'work-1',
      authorName: '  Maria  ',
      content: '  Ótimo trabalho!  ',
    });

    expect(result).toEqual(createdComment);
    expect(commentRepository.createPending).toHaveBeenCalledWith({
      workId: 'work-1',
      authorName: 'Maria',
      content: 'Ótimo trabalho!',
    });
  });

  it('retorna 404 quando o work não existe', async () => {
    const workRepository = buildWorkRepository({
      findById: jest.fn().mockResolvedValue(undefined),
    });
    const commentRepository = buildCommentRepository();

    const useCase = new CreateCommentUseCase(
      commentRepository,
      workRepository,
    );

    await expect(
      useCase.execute({
        workId: 'missing-work',
        authorName: 'Maria',
        content: 'Comentário',
      }),
    ).rejects.toMatchObject({ statusCode: 404 });

    expect(commentRepository.createPending).not.toHaveBeenCalled();
  });
});
