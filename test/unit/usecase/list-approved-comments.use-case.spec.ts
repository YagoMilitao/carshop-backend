import { ListApprovedCommentsUseCase } from '../../../src/usecase/list-approved-comments.use-case';
import type { CommentRepositoryPort } from '../../../src/core/domain/repositories/comment.repository';
import type { WorkRepositoryPort } from '../../../src/core/domain/repositories/work.repository';
import type {
  Comment,
  Work,
} from '../../../src/core/domain/application/Work/work.types';

describe('ListApprovedCommentsUseCase', () => {
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

  const approvedComments: Comment[] = [
    {
      id: 'comment-1',
      workId: 'work-1',
      authorName: 'Maria',
      content: 'Ótimo trabalho!',
      status: 'APPROVED',
      createdAt: '2024-01-01T00:00:00.000Z',
      updatedAt: '2024-01-01T00:00:00.000Z',
    },
  ];

  it('lista comentários aprovados quando o work existe', async () => {
    const workRepository = buildWorkRepository({
      findById: jest.fn().mockResolvedValue(work),
    });
    const commentRepository = buildCommentRepository({
      listApprovedByWorkId: jest.fn().mockResolvedValue(approvedComments),
    });

    const useCase = new ListApprovedCommentsUseCase(
      commentRepository,
      workRepository,
    );

    const result = await useCase.execute('work-1');

    expect(result).toEqual(approvedComments);
    expect(commentRepository.listApprovedByWorkId).toHaveBeenCalledWith(
      'work-1',
    );
  });

  it('retorna 404 quando o work não existe', async () => {
    const workRepository = buildWorkRepository({
      findById: jest.fn().mockResolvedValue(undefined),
    });
    const commentRepository = buildCommentRepository();

    const useCase = new ListApprovedCommentsUseCase(
      commentRepository,
      workRepository,
    );

    await expect(useCase.execute('missing-work')).rejects.toMatchObject({
      statusCode: 404,
    });
    expect(commentRepository.listApprovedByWorkId).not.toHaveBeenCalled();
  });
});
