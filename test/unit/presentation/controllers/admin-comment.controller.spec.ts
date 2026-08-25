import type { Request, Response } from 'express';
import { HttpError } from '../../../../src/core/domain/application/ApplicationError/http-error';
import type { ApproveCommentUseCase } from '../../../../src/usecase/approve-comment.use-case';
import type { UpdateCommentUseCase } from '../../../../src/usecase/update-comment.use-case';
import type { DeleteCommentUseCase } from '../../../../src/usecase/delete-comment.use-case';
import { AdminCommentController } from '../../../../src/presentation/controllers/admin-comment.controller';
import type { Comment } from '../../../../src/core/domain/application/Work/work.types';

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
      const { approveCommentUseCase, updateCommentUseCase, deleteCommentUseCase } =
        createUseCaseMocks();
      approveCommentUseCase.execute.mockResolvedValue(comment);
      const controller = new AdminCommentController(
        approveCommentUseCase,
        updateCommentUseCase,
        deleteCommentUseCase,
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
      const { approveCommentUseCase, updateCommentUseCase, deleteCommentUseCase } =
        createUseCaseMocks();
      const controller = new AdminCommentController(
        approveCommentUseCase,
        updateCommentUseCase,
        deleteCommentUseCase,
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
      const { approveCommentUseCase, updateCommentUseCase, deleteCommentUseCase } =
        createUseCaseMocks();
      updateCommentUseCase.execute.mockResolvedValue(comment);
      const controller = new AdminCommentController(
        approveCommentUseCase,
        updateCommentUseCase,
        deleteCommentUseCase,
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
      const { approveCommentUseCase, updateCommentUseCase, deleteCommentUseCase } =
        createUseCaseMocks();
      const controller = new AdminCommentController(
        approveCommentUseCase,
        updateCommentUseCase,
        deleteCommentUseCase,
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
      const { approveCommentUseCase, updateCommentUseCase, deleteCommentUseCase } =
        createUseCaseMocks();
      deleteCommentUseCase.execute.mockResolvedValue({ success: true });
      const controller = new AdminCommentController(
        approveCommentUseCase,
        updateCommentUseCase,
        deleteCommentUseCase,
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
      const { approveCommentUseCase, updateCommentUseCase, deleteCommentUseCase } =
        createUseCaseMocks();
      deleteCommentUseCase.execute.mockRejectedValue(
        new HttpError(404, 'Comentário não encontrado.'),
      );
      const controller = new AdminCommentController(
        approveCommentUseCase,
        updateCommentUseCase,
        deleteCommentUseCase,
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
});
