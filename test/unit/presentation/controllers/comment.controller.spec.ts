import type { Request, Response } from 'express';
import { HttpError } from '../../../../src/core/domain/application/ApplicationError/http-error';
import type { CreateCommentUseCase } from '../../../../src/usecase/create-comment.use-case';
import type { ListApprovedCommentsUseCase } from '../../../../src/usecase/list-approved-comments.use-case';
import { CommentController } from '../../../../src/presentation/controllers/comment.controller';
import type { Comment } from '../../../../src/core/domain/application/Work/work.types';

function createResponseMock() {
  return {
    status: jest.fn().mockReturnThis(),
    json: jest.fn(),
  } as unknown as Response;
}

function createUseCaseMocks() {
  return {
    createCommentUseCase: {
      execute: jest.fn(),
    } as unknown as jest.Mocked<CreateCommentUseCase>,
    listApprovedCommentsUseCase: {
      execute: jest.fn(),
    } as unknown as jest.Mocked<ListApprovedCommentsUseCase>,
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

describe('CommentController', () => {
  describe('create', () => {
    it('valida o body, cria o comentário e responde 201', async () => {
      const { createCommentUseCase, listApprovedCommentsUseCase } =
        createUseCaseMocks();
      createCommentUseCase.execute.mockResolvedValue(comment);
      const controller = new CommentController(
        createCommentUseCase,
        listApprovedCommentsUseCase,
      );

      const response = createResponseMock();
      const next = jest.fn();
      const request = {
        params: { workId: 'work-1' },
        body: { authorName: 'Maria', content: 'Ótimo trabalho!' },
      } as unknown as Request;

      await controller.create(request, response, next);

      expect(createCommentUseCase.execute).toHaveBeenCalledWith({
        workId: 'work-1',
        authorName: 'Maria',
        content: 'Ótimo trabalho!',
      });
      expect(response.status).toHaveBeenCalledWith(201);
      expect(response.json).toHaveBeenCalledWith(comment);
      expect(next).not.toHaveBeenCalled();
    });

    it('encaminha 400 quando workId está ausente', async () => {
      const { createCommentUseCase, listApprovedCommentsUseCase } =
        createUseCaseMocks();
      const controller = new CommentController(
        createCommentUseCase,
        listApprovedCommentsUseCase,
      );

      const response = createResponseMock();
      const next = jest.fn();
      const request = {
        params: { workId: '' },
        body: { authorName: 'Maria', content: 'Ótimo trabalho!' },
      } as unknown as Request;

      await controller.create(request, response, next);

      expect(createCommentUseCase.execute).not.toHaveBeenCalled();
      expect(next).toHaveBeenCalledWith(expect.any(HttpError));
    });

    it('encaminha 400 quando o body é inválido', async () => {
      const { createCommentUseCase, listApprovedCommentsUseCase } =
        createUseCaseMocks();
      const controller = new CommentController(
        createCommentUseCase,
        listApprovedCommentsUseCase,
      );

      const response = createResponseMock();
      const next = jest.fn();
      const request = {
        params: { workId: 'work-1' },
        body: { authorName: 'M', content: '' },
      } as unknown as Request;

      await controller.create(request, response, next);

      expect(createCommentUseCase.execute).not.toHaveBeenCalled();
      expect(next).toHaveBeenCalledWith(expect.any(HttpError));
    });
  });

  describe('listApproved', () => {
    it('lista comentários aprovados e responde 200', async () => {
      const { createCommentUseCase, listApprovedCommentsUseCase } =
        createUseCaseMocks();
      listApprovedCommentsUseCase.execute.mockResolvedValue([comment]);
      const controller = new CommentController(
        createCommentUseCase,
        listApprovedCommentsUseCase,
      );

      const response = createResponseMock();
      const next = jest.fn();
      const request = {
        params: { workId: 'work-1' },
      } as unknown as Request;

      await controller.listApproved(request, response, next);

      expect(listApprovedCommentsUseCase.execute).toHaveBeenCalledWith(
        'work-1',
      );
      expect(response.status).toHaveBeenCalledWith(200);
      expect(response.json).toHaveBeenCalledWith([comment]);
      expect(next).not.toHaveBeenCalled();
    });

    it('encaminha erros do caso de uso para o next', async () => {
      const { createCommentUseCase, listApprovedCommentsUseCase } =
        createUseCaseMocks();
      listApprovedCommentsUseCase.execute.mockRejectedValue(
        new HttpError(404, 'Trabalho não encontrado.'),
      );
      const controller = new CommentController(
        createCommentUseCase,
        listApprovedCommentsUseCase,
      );

      const response = createResponseMock();
      const next = jest.fn();
      const request = {
        params: { workId: 'missing-work' },
      } as unknown as Request;

      await controller.listApproved(request, response, next);

      expect(next).toHaveBeenCalledWith(expect.any(HttpError));
      expect(response.status).not.toHaveBeenCalled();
    });
  });
});
