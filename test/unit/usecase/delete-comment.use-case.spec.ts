import { DeleteCommentUseCase } from '../../../src/usecase/delete-comment.use-case';
import type { CommentRepositoryPort } from '../../../src/core/domain/repositories/comment.repository';
import type { Comment } from '../../../src/core/domain/application/Work/work.types';

describe('DeleteCommentUseCase', () => {
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

  const comment: Comment = {
    id: 'comment-1',
    workId: 'work-1',
    authorName: 'Maria',
    content: 'Ótimo trabalho!',
    status: 'PENDING',
    createdAt: '2024-01-01T00:00:00.000Z',
    updatedAt: '2024-01-01T00:00:00.000Z',
  };

  it('remove um comentário existente', async () => {
    const commentRepository = buildCommentRepository({
      findById: jest.fn().mockResolvedValue(comment),
      deleteById: jest.fn().mockResolvedValue(undefined),
    });

    const useCase = new DeleteCommentUseCase(commentRepository);

    const result = await useCase.execute('comment-1');

    expect(result).toEqual({ success: true });
    expect(commentRepository.deleteById).toHaveBeenCalledWith('comment-1');
  });

  it('retorna 404 quando o comentário não existe', async () => {
    const commentRepository = buildCommentRepository({
      findById: jest.fn().mockResolvedValue(undefined),
    });

    const useCase = new DeleteCommentUseCase(commentRepository);

    await expect(useCase.execute('missing-comment')).rejects.toMatchObject({
      statusCode: 404,
    });
    expect(commentRepository.deleteById).not.toHaveBeenCalled();
  });
});
