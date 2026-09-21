import type { Request, Response } from 'express';
import { HttpError } from '../../../../src/core/domain/application/ApplicationError/http-error';
import type { ApproveCommentUseCase } from '../../../../src/usecase/approve-comment.use-case';
import type { UpdateCommentUseCase } from '../../../../src/usecase/update-comment.use-case';
import type { DeleteCommentUseCase } from '../../../../src/usecase/delete-comment.use-case';
import type { ListCommentsForModerationUseCase } from '../../../../src/usecase/list-comments-for-moderation.use-case';
import { AdminCommentController } from '../../../../src/presentation/controllers/admin-comment.controller';
import type { Comment } from '../../../../src/core/domain/application/Work/work.types';
import type { PaginatedComments } from '../../../../src/core/domain/repositories/comment.repository';

function createResponseMock() {
  return {
    status: jest.fn().mockReturnThis(),
    json: jest.fn(),
  } as unknown as Response;
}

function createUseCaseMocks() {
  return {
    approveCommentUseCase: {
      execute: jest.fn(),
    } as unknown as jest.Mocked<ApproveCommentUseCase>,
    updateCommentUseCase: {
      execute: jest.fn(),
    } as unknown as jest.Mocked<UpdateCommentUseCase>,
    deleteCommentUseCase: {
      execute: jest.fn(),
    } as unknown as jest.Mocked<DeleteCommentUseCase>,
    listCommentsForModerationUseCase: {
      execute: jest.fn(),
    } as unknown as jest.Mocked<ListCommentsForModerationUseCase>,
  };
}

const comment: Comment = {
  id: 'comment-1',
  workId: 'work-1',
  authorName: 'Maria',
  content: 'Ótimo trabalho!',
  status: 'APPROVED',
  createdAt: '2024-01-01T00:00:00.000Z',
  updatedAt: '2024-01-01T00:00:00.000Z',
};

describe('AdminCommentController', () => {
  describe('approve', () => {
    it('aprova o comentário e responde 200', async () => {
      const {
        approveCommentUseCase,
        updateCommentUseCase,
        deleteCommentUseCase,
        listCommentsForModerationUseCase,
      } = createUseCaseMocks();
      approveCommentUseCase.execute.mockResolvedValue(comment);
      const controller = new AdminCommentController(
        approveCommentUseCase,
        updateCommentUseCase,
        deleteCommentUseCase,
        listCommentsForModerationUseCase,
      );

      const response = createResponseMock();
      const next = jest.fn();
      const request = {
        params: { commentId: 'comment-1' },
      } as unknown as Request;

      await controller.approve(request, response, next);

      expect(approveCommentUseCase.execute).toHaveBeenCalledWith('comment-1');
      expect(response.status).toHaveBeenCalledWith(200);
      expect(response.json).toHaveBeenCalledWith(comment);
      expect(next).not.toHaveBeenCalled();
    });

    it('encaminha erro de commentId inválido para o next', async () => {
      const {
        approveCommentUseCase,
        updateCommentUseCase,
        deleteCommentUseCase,
        listCommentsForModerationUseCase,
      } = createUseCaseMocks();
      const controller = new AdminCommentController(
        approveCommentUseCase,
        updateCommentUseCase,
        deleteCommentUseCase,
        listCommentsForModerationUseCase,
      );

      const response = createResponseMock();
      const next = jest.fn();
      const request = { params: { commentId: '' } } as unknown as Request;

      await controller.approve(request, response, next);

      expect(approveCommentUseCase.execute).not.toHaveBeenCalled();
      expect(next).toHaveBeenCalledWith(expect.any(HttpError));
    });
  });

  describe('update', () => {
    it('valida o body e atualiza o comentário, respondendo 200', async () => {
      const {
        approveCommentUseCase,
        updateCommentUseCase,
        deleteCommentUseCase,
        listCommentsForModerationUseCase,
      } = createUseCaseMocks();
      updateCommentUseCase.execute.mockResolvedValue(comment);
      const controller = new AdminCommentController(
        approveCommentUseCase,
        updateCommentUseCase,
        deleteCommentUseCase,
        listCommentsForModerationUseCase,
      );

      const response = createResponseMock();
      const next = jest.fn();
      const request = {
        params: { commentId: 'comment-1' },
        body: { content: 'Comentário editado' },
      } as unknown as Request;

      await controller.update(request, response, next);

      expect(updateCommentUseCase.execute).toHaveBeenCalledWith('comment-1', {
        content: 'Comentário editado',
      });
      expect(response.status).toHaveBeenCalledWith(200);
      expect(response.json).toHaveBeenCalledWith(comment);
      expect(next).not.toHaveBeenCalled();
    });

    it('encaminha 400 quando o body é inválido', async () => {
      const {
        approveCommentUseCase,
        updateCommentUseCase,
        deleteCommentUseCase,
        listCommentsForModerationUseCase,
      } = createUseCaseMocks();
      const controller = new AdminCommentController(
        approveCommentUseCase,
        updateCommentUseCase,
        deleteCommentUseCase,
        listCommentsForModerationUseCase,
      );

      const response = createResponseMock();
      const next = jest.fn();
      const request = {
        params: { commentId: 'comment-1' },
        body: {},
      } as unknown as Request;

      await controller.update(request, response, next);

      expect(updateCommentUseCase.execute).not.toHaveBeenCalled();
      expect(next).toHaveBeenCalledWith(expect.any(HttpError));
    });
  });

  describe('delete', () => {
    it('remove o comentário e responde 200', async () => {
      const {
        approveCommentUseCase,
        updateCommentUseCase,
        deleteCommentUseCase,
        listCommentsForModerationUseCase,
      } = createUseCaseMocks();
      deleteCommentUseCase.execute.mockResolvedValue({ success: true });
      const controller = new AdminCommentController(
        approveCommentUseCase,
        updateCommentUseCase,
        deleteCommentUseCase,
        listCommentsForModerationUseCase,
      );

      const response = createResponseMock();
      const next = jest.fn();
      const request = {
        params: { commentId: 'comment-1' },
      } as unknown as Request;

      await controller.delete(request, response, next);

      expect(deleteCommentUseCase.execute).toHaveBeenCalledWith('comment-1');
      expect(response.status).toHaveBeenCalledWith(200);
      expect(response.json).toHaveBeenCalledWith({ success: true });
      expect(next).not.toHaveBeenCalled();
    });

    it('encaminha erros do caso de uso para o next', async () => {
      const {
        approveCommentUseCase,
        updateCommentUseCase,
        deleteCommentUseCase,
        listCommentsForModerationUseCase,
      } = createUseCaseMocks();
      deleteCommentUseCase.execute.mockRejectedValue(
        new HttpError(404, 'Comentário não encontrado.'),
      );
      const controller = new AdminCommentController(
        approveCommentUseCase,
        updateCommentUseCase,
        deleteCommentUseCase,
        listCommentsForModerationUseCase,
      );

      const response = createResponseMock();
      const next = jest.fn();
      const request = {
        params: { commentId: 'missing-comment' },
      } as unknown as Request;

      await controller.delete(request, response, next);

      expect(next).toHaveBeenCalledWith(expect.any(HttpError));
      expect(response.status).not.toHaveBeenCalled();
    });
  });

  describe('list', () => {
    const paginatedComments: PaginatedComments = {
      items: [comment],
      page: 1,
      limit: 20,
      total: 1,
      totalPages: 1,
    };

    it('valida a query, chama o use case e responde 200 com o envelope (AC-002)', async () => {
      const {
        approveCommentUseCase,
        updateCommentUseCase,
        deleteCommentUseCase,
        listCommentsForModerationUseCase,
      } = createUseCaseMocks();
      listCommentsForModerationUseCase.execute.mockResolvedValue(
        paginatedComments,
      );
      const controller = new AdminCommentController(
        approveCommentUseCase,
        updateCommentUseCase,
        deleteCommentUseCase,
        listCommentsForModerationUseCase,
      );

      const response = createResponseMock();
      const next = jest.fn();
      const request = {
        query: { status: 'PENDING', page: '2', limit: '10' },
      } as unknown as Request;

      await controller.list(request, response, next);

      expect(listCommentsForModerationUseCase.execute).toHaveBeenCalledWith({
        status: 'PENDING',
        page: 2,
        limit: 10,
      });
      expect(response.status).toHaveBeenCalledWith(200);
      expect(response.json).toHaveBeenCalledWith(paginatedComments);
      expect(next).not.toHaveBeenCalled();
    });

    it('aplica page/limit padrão quando não informados (AC-002)', async () => {
      const {
        approveCommentUseCase,
        updateCommentUseCase,
        deleteCommentUseCase,
        listCommentsForModerationUseCase,
      } = createUseCaseMocks();
      listCommentsForModerationUseCase.execute.mockResolvedValue(
        paginatedComments,
      );
      const controller = new AdminCommentController(
        approveCommentUseCase,
        updateCommentUseCase,
        deleteCommentUseCase,
        listCommentsForModerationUseCase,
      );

      const response = createResponseMock();
      const next = jest.fn();
      const request = { query: {} } as unknown as Request;

      await controller.list(request, response, next);

      expect(listCommentsForModerationUseCase.execute).toHaveBeenCalledWith({
        page: 1,
        limit: 20,
      });
      expect(response.status).toHaveBeenCalledWith(200);
    });

    it('encaminha 400 para o next quando status é inválido, sem chamar o use case (AC-006)', async () => {
      const {
        approveCommentUseCase,
        updateCommentUseCase,
        deleteCommentUseCase,
        listCommentsForModerationUseCase,
      } = createUseCaseMocks();
      const controller = new AdminCommentController(
        approveCommentUseCase,
        updateCommentUseCase,
        deleteCommentUseCase,
        listCommentsForModerationUseCase,
      );

      const response = createResponseMock();
      const next = jest.fn();
      const request = {
        query: { status: 'INVALID' },
      } as unknown as Request;

      await controller.list(request, response, next);

      expect(listCommentsForModerationUseCase.execute).not.toHaveBeenCalled();
      expect(next).toHaveBeenCalledWith(expect.any(HttpError));
      expect(response.status).not.toHaveBeenCalled();
    });
  });
});
