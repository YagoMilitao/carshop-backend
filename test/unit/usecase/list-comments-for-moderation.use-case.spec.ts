import { ListCommentsForModerationUseCase } from '../../../src/usecase/list-comments-for-moderation.use-case';
import type {
  CommentRepositoryPort,
  ListCommentsForModerationInput,
  PaginatedComments,
} from '../../../src/core/domain/repositories/comment.repository';
import type { Comment } from '../../../src/core/domain/application/Work/work.types';

function createCommentRepositoryMock(): jest.Mocked<CommentRepositoryPort> {
  return {
    createPending: jest.fn(),
    listApprovedByWorkId: jest.fn(),
    findById: jest.fn(),
    update: jest.fn(),
    deleteById: jest.fn(),
    listForModeration: jest.fn(),
  };
}

const comment: Comment = {
  id: 'comment-1',
  workId: 'work-1',
  authorName: 'Maria',
  content: 'Ótimo trabalho!',
  status: 'PENDING',
  createdAt: '2024-01-01T00:00:00.000Z',
  updatedAt: '2024-01-01T00:00:00.000Z',
};

describe('ListCommentsForModerationUseCase', () => {
  it('repassa o input recebido diretamente para CommentRepositoryPort#listForModeration (NFR-001)', async () => {
    const commentRepository = createCommentRepositoryMock();
    const paginatedComments: PaginatedComments = {
      items: [comment],
      page: 2,
      limit: 10,
      total: 11,
      totalPages: 2,
    };
    commentRepository.listForModeration.mockResolvedValue(paginatedComments);

    const useCase = new ListCommentsForModerationUseCase(commentRepository);
    const input: ListCommentsForModerationInput = {
      status: 'PENDING',
      page: 2,
      limit: 10,
    };

    const result = await useCase.execute(input);

    expect(commentRepository.listForModeration).toHaveBeenCalledWith(input);
    expect(commentRepository.listForModeration).toHaveBeenCalledTimes(1);
    expect(result).toBe(paginatedComments);
  });

  it('repassa o input sem status (listagem sem filtro) (AC-002, FR-003)', async () => {
    const commentRepository = createCommentRepositoryMock();
    const paginatedComments: PaginatedComments = {
      items: [],
      page: 1,
      limit: 20,
      total: 0,
      totalPages: 1,
    };
    commentRepository.listForModeration.mockResolvedValue(paginatedComments);

    const useCase = new ListCommentsForModerationUseCase(commentRepository);
    const input: ListCommentsForModerationInput = { page: 1, limit: 20 };

    const result = await useCase.execute(input);

    expect(commentRepository.listForModeration).toHaveBeenCalledWith(input);
    expect(result).toEqual(paginatedComments);
  });

  it('propaga o erro lançado pelo repositório sem transformá-lo (ex.: filtro inválido)', async () => {
    const commentRepository = createCommentRepositoryMock();
    const repositoryError = new Error('status inválido');
    commentRepository.listForModeration.mockRejectedValue(repositoryError);

    const useCase = new ListCommentsForModerationUseCase(commentRepository);

    await expect(
      useCase.execute({ status: 'INVALID' as never, page: 1, limit: 20 }),
    ).rejects.toBe(repositoryError);
  });
});
