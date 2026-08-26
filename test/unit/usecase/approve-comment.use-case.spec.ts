import { ApproveCommentUseCase } from '../../../src/usecase/approve-comment.use-case';
import type { CommentRepositoryPort } from '../../../src/core/domain/repositories/comment.repository';
import type { Comment } from '../../../src/core/domain/application/Work/work.types';

describe('ApproveCommentUseCase', () => {
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

  const pendingComment: Comment = {
    id: 'comment-1',
    workId: 'work-1',
    authorName: 'Maria',
    content: 'Ótimo trabalho!',
    status: 'PENDING',
    createdAt: '2024-01-01T00:00:00.000Z',
    updatedAt: '2024-01-01T00:00:00.000Z',
  };

  it('aprova um comentário pendente existente', async () => {
    const approvedComment: Comment = {
      ...pendingComment,
      status: 'APPROVED',
    };
    const commentRepository = buildCommentRepository({
      findById: jest.fn().mockResolvedValue(pendingComment),
      update: jest.fn().mockResolvedValue(approvedComment),
    });

    const useCase = new ApproveCommentUseCase(commentRepository);

    const result = await useCase.execute('comment-1');

    expect(result).toEqual(approvedComment);
    expect(commentRepository.update).toHaveBeenCalledWith('comment-1', {
      status: 'APPROVED',
    });
  });

  it('retorna 404 quando o comentário não existe', async () => {
    const commentRepository = buildCommentRepository({
      findById: jest.fn().mockResolvedValue(undefined),
    });

    const useCase = new ApproveCommentUseCase(commentRepository);

    await expect(useCase.execute('missing-comment')).rejects.toMatchObject({
      statusCode: 404,
    });
    expect(commentRepository.update).not.toHaveBeenCalled();
  });

  it('retorna 500 quando a atualização falha', async () => {
    const commentRepository = buildCommentRepository({
      findById: jest.fn().mockResolvedValue(pendingComment),
      update: jest.fn().mockResolvedValue(undefined),
    });

    const useCase = new ApproveCommentUseCase(commentRepository);

    await expect(useCase.execute('comment-1')).rejects.toMatchObject({
      statusCode: 500,
    });
  });
});
