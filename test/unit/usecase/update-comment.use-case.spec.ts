import { UpdateCommentUseCase } from '../../../src/usecase/update-comment.use-case';
import type { CommentRepositoryPort } from '../../../src/core/domain/repositories/comment.repository';
import type { Comment } from '../../../src/core/domain/application/Work/work.types';

describe('UpdateCommentUseCase', () => {
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

  it('atualiza um comentário existente', async () => {
    const updatedComment: Comment = { ...comment, content: 'Editado' };
    const commentRepository = buildCommentRepository({
      findById: jest.fn().mockResolvedValue(comment),
      update: jest.fn().mockResolvedValue(updatedComment),
    });

    const useCase = new UpdateCommentUseCase(commentRepository);

    const result = await useCase.execute('comment-1', { content: 'Editado' });

    expect(result).toEqual(updatedComment);
    expect(commentRepository.update).toHaveBeenCalledWith('comment-1', {
      content: 'Editado',
    });
  });

  it('retorna 404 quando o comentário não existe', async () => {
    const commentRepository = buildCommentRepository({
      findById: jest.fn().mockResolvedValue(undefined),
    });

    const useCase = new UpdateCommentUseCase(commentRepository);

    await expect(
      useCase.execute('missing-comment', { content: 'Editado' }),
    ).rejects.toMatchObject({ statusCode: 404 });
    expect(commentRepository.update).not.toHaveBeenCalled();
  });

  it('retorna 500 quando a atualização falha', async () => {
    const commentRepository = buildCommentRepository({
      findById: jest.fn().mockResolvedValue(comment),
      update: jest.fn().mockResolvedValue(undefined),
    });

    const useCase = new UpdateCommentUseCase(commentRepository);

    await expect(
      useCase.execute('comment-1', { content: 'Editado' }),
    ).rejects.toMatchObject({ statusCode: 500 });
  });
});
