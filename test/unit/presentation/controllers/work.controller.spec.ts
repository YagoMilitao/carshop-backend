import type { Request, Response } from 'express';
import { HttpError } from '../../../../src/core/domain/application/ApplicationError/http-error';
import type { CreateWorkUseCase } from '../../../../src/usecase/create-work.use-case';
import type { ListWorksUseCase } from '../../../../src/usecase/list-works.use-case';
import type { GetWorkBySlugUseCase } from '../../../../src/usecase/get-work-by-slug.use-case';
import { WorkController } from '../../../../src/presentation/controllers/work.controller';
import type { Work } from '../../../../src/core/domain/application/Work/work.types';

function createResponseMock() {
  return {
    status: jest.fn().mockReturnThis(),
    json: jest.fn(),
  } as unknown as Response;
}

function createUseCaseMocks() {
  return {
    createWorkUseCase: {
      execute: jest.fn(),
    } as unknown as jest.Mocked<CreateWorkUseCase>,
    listWorksUseCase: {
      execute: jest.fn(),
    } as unknown as jest.Mocked<ListWorksUseCase>,
    getWorkBySlugUseCase: {
      execute: jest.fn(),
    } as unknown as jest.Mocked<GetWorkBySlugUseCase>,
  };
}

const work: Work = {
  id: 'work-1',
  slug: 'work-slug',
  title: 'Work title',
  description: 'Work description',
  category: 'bancos',
  tags: ['couro'],
  images: [],
  status: 'draft',
  deletedAt: null,
  createdAt: '2024-01-01T00:00:00.000Z',
  updatedAt: '2024-01-01T00:00:00.000Z',
};

describe('WorkController', () => {
  describe('create', () => {
    it('cria um trabalho válido e responde 201', async () => {
      const { createWorkUseCase, listWorksUseCase, getWorkBySlugUseCase } =
        createUseCaseMocks();
      createWorkUseCase.execute.mockResolvedValue(work);
      const controller = new WorkController(
        createWorkUseCase,
        listWorksUseCase,
        getWorkBySlugUseCase,
      );

      const response = createResponseMock();
      const next = jest.fn();
      const request = {
        body: {
          slug: 'work-slug',
          title: 'Work title',
          description: 'Work description',
          category: 'bancos',
          tags: ['couro'],
          status: 'draft',
        },
      } as unknown as Request;

      await controller.create(request, response, next);

      expect(createWorkUseCase.execute).toHaveBeenCalledWith({
        slug: 'work-slug',
        title: 'Work title',
        description: 'Work description',
        category: 'bancos',
        tags: ['couro'],
        status: 'draft',
      });
      expect(response.status).toHaveBeenCalledWith(201);
      expect(response.json).toHaveBeenCalledWith(work);
      expect(next).not.toHaveBeenCalled();
    });

    it('usa tags vazias e status draft quando ausentes', async () => {
      const { createWorkUseCase, listWorksUseCase, getWorkBySlugUseCase } =
        createUseCaseMocks();
      createWorkUseCase.execute.mockResolvedValue(work);
      const controller = new WorkController(
        createWorkUseCase,
        listWorksUseCase,
        getWorkBySlugUseCase,
      );

      const response = createResponseMock();
      const next = jest.fn();
      const request = {
        body: {
          slug: 'work-slug',
          title: 'Work title',
          description: 'Work description',
          category: 'bancos',
        },
      } as unknown as Request;

      await controller.create(request, response, next);

      expect(createWorkUseCase.execute).toHaveBeenCalledWith(
        expect.objectContaining({ tags: [], status: 'draft' }),
      );
    });

    it('encaminha 400 quando o payload é inválido', async () => {
      const { createWorkUseCase, listWorksUseCase, getWorkBySlugUseCase } =
        createUseCaseMocks();
      const controller = new WorkController(
        createWorkUseCase,
        listWorksUseCase,
        getWorkBySlugUseCase,
      );

      const response = createResponseMock();
      const next = jest.fn();
      const request = {
        body: { slug: 'work-slug' },
      } as unknown as Request;

      await controller.create(request, response, next);

      expect(createWorkUseCase.execute).not.toHaveBeenCalled();
      expect(next).toHaveBeenCalledWith(expect.any(HttpError));
    });
  });

  describe('list', () => {
    it('lista trabalhos publicados quando includeDrafts não é "true"', async () => {
      const { createWorkUseCase, listWorksUseCase, getWorkBySlugUseCase } =
        createUseCaseMocks();
      listWorksUseCase.execute.mockResolvedValue([work]);
      const controller = new WorkController(
        createWorkUseCase,
        listWorksUseCase,
        getWorkBySlugUseCase,
      );

      const response = createResponseMock();
      const next = jest.fn();
      const request = { query: {} } as unknown as Request;

      await controller.list(request, response, next);

      expect(listWorksUseCase.execute).toHaveBeenCalledWith({
        includeDrafts: false,
      });
      expect(response.status).toHaveBeenCalledWith(200);
      expect(response.json).toHaveBeenCalledWith([work]);
    });

    it('lista todos os trabalhos quando includeDrafts=true', async () => {
      const { createWorkUseCase, listWorksUseCase, getWorkBySlugUseCase } =
        createUseCaseMocks();
      listWorksUseCase.execute.mockResolvedValue([work]);
      const controller = new WorkController(
        createWorkUseCase,
        listWorksUseCase,
        getWorkBySlugUseCase,
      );

      const response = createResponseMock();
      const next = jest.fn();
      const request = { query: { includeDrafts: 'true' } } as unknown as Request;

      await controller.list(request, response, next);

      expect(listWorksUseCase.execute).toHaveBeenCalledWith({
        includeDrafts: true,
      });
    });

    it('encaminha erros do caso de uso para o next', async () => {
      const { createWorkUseCase, listWorksUseCase, getWorkBySlugUseCase } =
        createUseCaseMocks();
      listWorksUseCase.execute.mockRejectedValue(new Error('boom'));
      const controller = new WorkController(
        createWorkUseCase,
        listWorksUseCase,
        getWorkBySlugUseCase,
      );

      const response = createResponseMock();
      const next = jest.fn();
      const request = { query: {} } as unknown as Request;

      await controller.list(request, response, next);

      expect(next).toHaveBeenCalledWith(expect.any(Error));
      expect(response.status).not.toHaveBeenCalled();
    });
  });

  describe('getBySlug', () => {
    it('responde 200 com o trabalho encontrado para um slug válido', async () => {
      const { createWorkUseCase, listWorksUseCase, getWorkBySlugUseCase } =
        createUseCaseMocks();
      getWorkBySlugUseCase.execute.mockResolvedValue(work);
      const controller = new WorkController(
        createWorkUseCase,
        listWorksUseCase,
        getWorkBySlugUseCase,
      );

      const response = createResponseMock();
      const next = jest.fn();
      const request = {
        params: { slug: 'work-slug' },
      } as unknown as Request;

      await controller.getBySlug(request, response, next);

      expect(getWorkBySlugUseCase.execute).toHaveBeenCalledWith('work-slug');
      expect(response.status).toHaveBeenCalledWith(200);
      expect(response.json).toHaveBeenCalledWith(work);
      expect(next).not.toHaveBeenCalled();
    });

    it('encaminha 400 quando o parâmetro slug está ausente ou em branco', async () => {
      const { createWorkUseCase, listWorksUseCase, getWorkBySlugUseCase } =
        createUseCaseMocks();
      const controller = new WorkController(
        createWorkUseCase,
        listWorksUseCase,
        getWorkBySlugUseCase,
      );

      const response = createResponseMock();
      const next = jest.fn();
      const request = { params: { slug: '  ' } } as unknown as Request;

      await controller.getBySlug(request, response, next);

      expect(getWorkBySlugUseCase.execute).not.toHaveBeenCalled();
      expect(next).toHaveBeenCalledWith(expect.any(HttpError));
      expect(response.status).not.toHaveBeenCalled();
    });

    it('encaminha o erro 404 do caso de uso para o next', async () => {
      const { createWorkUseCase, listWorksUseCase, getWorkBySlugUseCase } =
        createUseCaseMocks();
      const notFoundError = new HttpError(404, 'Trabalho não encontrado.');
      getWorkBySlugUseCase.execute.mockRejectedValue(notFoundError);
      const controller = new WorkController(
        createWorkUseCase,
        listWorksUseCase,
        getWorkBySlugUseCase,
      );

      const response = createResponseMock();
      const next = jest.fn();
      const request = {
        params: { slug: 'does-not-exist' },
      } as unknown as Request;

      await controller.getBySlug(request, response, next);

      expect(next).toHaveBeenCalledWith(notFoundError);
      expect(response.status).not.toHaveBeenCalled();
    });
  });
});
