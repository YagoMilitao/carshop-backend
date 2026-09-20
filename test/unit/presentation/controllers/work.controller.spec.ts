import type { Request, Response } from 'express';
import { HttpError } from '../../../../src/core/domain/application/ApplicationError/http-error';
import type { CreateWorkUseCase } from '../../../../src/usecase/create-work.use-case';
import type { ListWorksUseCase } from '../../../../src/usecase/list-works.use-case';
import type { GetWorkBySlugUseCase } from '../../../../src/usecase/get-work-by-slug.use-case';
import type { UpdateWorkUseCase } from '../../../../src/usecase/update-work.use-case';
import { WorkController } from '../../../../src/presentation/controllers/work.controller';
import type { Work } from '../../../../src/core/domain/application/Work/work.types';
import { toPublicWorkResponse } from '../../../../src/presentation/helpers/work-response.mapper';

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
    updateWorkUseCase: {
      execute: jest.fn(),
    } as unknown as jest.Mocked<UpdateWorkUseCase>,
  };
}

const work: Work = {
  id: 'work-1',
  slug: 'work-slug',
  title: 'Work title',
  description: 'Work description',
  category: 'bancos',
  tags: ['couro'],
  images: [
    {
      id: 'image-1',
      url: 'https://cdn.example.com/image-1.png',
      publicId: 'carshop/works/work-1/image-1',
      alt: 'Imagem',
      isCover: true,
      order: 0,
      createdAt: '2024-01-01T00:00:00.000Z',
      updatedAt: '2024-01-01T00:00:00.000Z',
    },
  ],
  status: 'draft',
  deletedAt: null,
  createdAt: '2024-01-01T00:00:00.000Z',
  updatedAt: '2024-01-01T00:00:00.000Z',
};

describe('WorkController', () => {
  describe('create', () => {
    it('cria um trabalho válido e responde 201', async () => {
      const {
        createWorkUseCase,
        listWorksUseCase,
        getWorkBySlugUseCase,
        updateWorkUseCase,
      } = createUseCaseMocks();
      createWorkUseCase.execute.mockResolvedValue(work);
      const controller = new WorkController(
        createWorkUseCase,
        listWorksUseCase,
        getWorkBySlugUseCase,
        updateWorkUseCase,
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
      const {
        createWorkUseCase,
        listWorksUseCase,
        getWorkBySlugUseCase,
        updateWorkUseCase,
      } = createUseCaseMocks();
      createWorkUseCase.execute.mockResolvedValue(work);
      const controller = new WorkController(
        createWorkUseCase,
        listWorksUseCase,
        getWorkBySlugUseCase,
        updateWorkUseCase,
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
      const {
        createWorkUseCase,
        listWorksUseCase,
        getWorkBySlugUseCase,
        updateWorkUseCase,
      } = createUseCaseMocks();
      const controller = new WorkController(
        createWorkUseCase,
        listWorksUseCase,
        getWorkBySlugUseCase,
        updateWorkUseCase,
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

    it('encaminha 400 e não invoca o caso de uso quando body contém propriedade desconhecida (AC-001/FR-005)', async () => {
      const {
        createWorkUseCase,
        listWorksUseCase,
        getWorkBySlugUseCase,
        updateWorkUseCase,
      } = createUseCaseMocks();
      const controller = new WorkController(
        createWorkUseCase,
        listWorksUseCase,
        getWorkBySlugUseCase,
        updateWorkUseCase,
      );

      const response = createResponseMock();
      const next = jest.fn();
      const request = {
        body: {
          slug: 'work-slug',
          title: 'Work title',
          description: 'Work description',
          category: 'bancos',
          unknownField: 'not allowed',
        },
      } as unknown as Request;

      await controller.create(request, response, next);

      expect(createWorkUseCase.execute).not.toHaveBeenCalled();
      expect(next).toHaveBeenCalledWith(expect.any(HttpError));
      expect(response.status).not.toHaveBeenCalled();
    });

    it('encaminha 400 e não invoca o caso de uso quando tags não é um array (AC-001)', async () => {
      const {
        createWorkUseCase,
        listWorksUseCase,
        getWorkBySlugUseCase,
        updateWorkUseCase,
      } = createUseCaseMocks();
      const controller = new WorkController(
        createWorkUseCase,
        listWorksUseCase,
        getWorkBySlugUseCase,
        updateWorkUseCase,
      );

      const response = createResponseMock();
      const next = jest.fn();
      const request = {
        body: {
          slug: 'work-slug',
          title: 'Work title',
          description: 'Work description',
          category: 'bancos',
          tags: 'couro',
        },
      } as unknown as Request;

      await controller.create(request, response, next);

      expect(createWorkUseCase.execute).not.toHaveBeenCalled();
      expect(next).toHaveBeenCalledWith(expect.any(HttpError));
      expect(response.status).not.toHaveBeenCalled();
    });
  });

  describe('list', () => {
    it('lista trabalhos publicados quando includeDrafts não é "true" e retorna o formato público minimizado quando não autenticado (FR-006/FR-007)', async () => {
      const {
        createWorkUseCase,
        listWorksUseCase,
        getWorkBySlugUseCase,
        updateWorkUseCase,
      } = createUseCaseMocks();
      listWorksUseCase.execute.mockResolvedValue([work]);
      const controller = new WorkController(
        createWorkUseCase,
        listWorksUseCase,
        getWorkBySlugUseCase,
        updateWorkUseCase,
      );

      const response = createResponseMock();
      const next = jest.fn();
      const request = { query: {} } as unknown as Request;

      await controller.list(request, response, next);

      expect(listWorksUseCase.execute).toHaveBeenCalledWith({
        includeDrafts: false,
      });
      expect(response.status).toHaveBeenCalledWith(200);
      expect(response.json).toHaveBeenCalledWith([toPublicWorkResponse(work)]);
      const [[responseBody]] = (response.json as jest.Mock).mock.calls;
      expect(responseBody[0]).not.toHaveProperty('deletedAt');
      expect(responseBody[0].images[0]).not.toHaveProperty('publicId');
    });

    it('lista todos os trabalhos quando includeDrafts=true e retorna o formato completo quando autenticado (AC-007)', async () => {
      const {
        createWorkUseCase,
        listWorksUseCase,
        getWorkBySlugUseCase,
        updateWorkUseCase,
      } = createUseCaseMocks();
      listWorksUseCase.execute.mockResolvedValue([work]);
      const controller = new WorkController(
        createWorkUseCase,
        listWorksUseCase,
        getWorkBySlugUseCase,
        updateWorkUseCase,
      );

      const response = createResponseMock();
      const next = jest.fn();
      const request = {
        query: { includeDrafts: 'true' },
        auth: { sessionId: 'session-1' },
      } as unknown as Request;

      await controller.list(request, response, next);

      expect(listWorksUseCase.execute).toHaveBeenCalledWith({
        includeDrafts: true,
      });
      expect(response.json).toHaveBeenCalledWith([work]);
    });

    it('encaminha erros do caso de uso para o next', async () => {
      const {
        createWorkUseCase,
        listWorksUseCase,
        getWorkBySlugUseCase,
        updateWorkUseCase,
      } = createUseCaseMocks();
      listWorksUseCase.execute.mockRejectedValue(new Error('boom'));
      const controller = new WorkController(
        createWorkUseCase,
        listWorksUseCase,
        getWorkBySlugUseCase,
        updateWorkUseCase,
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
    it('responde 200 com o formato público minimizado do trabalho encontrado para um slug válido (FR-006/FR-007)', async () => {
      const {
        createWorkUseCase,
        listWorksUseCase,
        getWorkBySlugUseCase,
        updateWorkUseCase,
      } = createUseCaseMocks();
      getWorkBySlugUseCase.execute.mockResolvedValue(work);
      const controller = new WorkController(
        createWorkUseCase,
        listWorksUseCase,
        getWorkBySlugUseCase,
        updateWorkUseCase,
      );

      const response = createResponseMock();
      const next = jest.fn();
      const request = {
        params: { slug: 'work-slug' },
      } as unknown as Request;

      await controller.getBySlug(request, response, next);

      expect(getWorkBySlugUseCase.execute).toHaveBeenCalledWith('work-slug');
      expect(response.status).toHaveBeenCalledWith(200);
      expect(response.json).toHaveBeenCalledWith(toPublicWorkResponse(work));
      const [[responseBody]] = (response.json as jest.Mock).mock.calls;
      expect(responseBody).not.toHaveProperty('deletedAt');
      expect(responseBody.images[0]).not.toHaveProperty('publicId');
      expect(next).not.toHaveBeenCalled();
    });

    it('encaminha 400 quando o parâmetro slug está ausente ou em branco', async () => {
      const {
        createWorkUseCase,
        listWorksUseCase,
        getWorkBySlugUseCase,
        updateWorkUseCase,
      } = createUseCaseMocks();
      const controller = new WorkController(
        createWorkUseCase,
        listWorksUseCase,
        getWorkBySlugUseCase,
        updateWorkUseCase,
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
      const {
        createWorkUseCase,
        listWorksUseCase,
        getWorkBySlugUseCase,
        updateWorkUseCase,
      } = createUseCaseMocks();
      const notFoundError = new HttpError(404, 'Trabalho não encontrado.');
      getWorkBySlugUseCase.execute.mockRejectedValue(notFoundError);
      const controller = new WorkController(
        createWorkUseCase,
        listWorksUseCase,
        getWorkBySlugUseCase,
        updateWorkUseCase,
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

  describe('update (CARSHOP-135)', () => {
    it('atualiza um work válido e responde 200 com o corpo retornado pelo caso de uso (AC-001)', async () => {
      const {
        createWorkUseCase,
        listWorksUseCase,
        getWorkBySlugUseCase,
        updateWorkUseCase,
      } = createUseCaseMocks();
      const updatedWork: Work = { ...work, title: 'Novo título' };
      updateWorkUseCase.execute.mockResolvedValue(updatedWork);
      const controller = new WorkController(
        createWorkUseCase,
        listWorksUseCase,
        getWorkBySlugUseCase,
        updateWorkUseCase,
      );

      const response = createResponseMock();
      const next = jest.fn();
      const request = {
        params: { workId: 'work-1' },
        body: { title: 'Novo título' },
      } as unknown as Request;

      await controller.update(request, response, next);

      expect(updateWorkUseCase.execute).toHaveBeenCalledWith('work-1', {
        title: 'Novo título',
      });
      expect(response.status).toHaveBeenCalledWith(200);
      expect(response.json).toHaveBeenCalledWith(updatedWork);
      expect(next).not.toHaveBeenCalled();
    });

    it('encaminha 400 e não invoca o caso de uso quando o payload é inválido (AC-005)', async () => {
      const {
        createWorkUseCase,
        listWorksUseCase,
        getWorkBySlugUseCase,
        updateWorkUseCase,
      } = createUseCaseMocks();
      const controller = new WorkController(
        createWorkUseCase,
        listWorksUseCase,
        getWorkBySlugUseCase,
        updateWorkUseCase,
      );

      const response = createResponseMock();
      const next = jest.fn();
      const request = {
        params: { workId: 'work-1' },
        body: { tags: 'couro' },
      } as unknown as Request;

      await controller.update(request, response, next);

      expect(updateWorkUseCase.execute).not.toHaveBeenCalled();
      expect(next).toHaveBeenCalledWith(expect.any(HttpError));
      expect(response.status).not.toHaveBeenCalled();
    });

    it('encaminha 400 e não invoca o caso de uso quando o payload não possui nenhum campo (AC-005)', async () => {
      const {
        createWorkUseCase,
        listWorksUseCase,
        getWorkBySlugUseCase,
        updateWorkUseCase,
      } = createUseCaseMocks();
      const controller = new WorkController(
        createWorkUseCase,
        listWorksUseCase,
        getWorkBySlugUseCase,
        updateWorkUseCase,
      );

      const response = createResponseMock();
      const next = jest.fn();
      const request = {
        params: { workId: 'work-1' },
        body: {},
      } as unknown as Request;

      await controller.update(request, response, next);

      expect(updateWorkUseCase.execute).not.toHaveBeenCalled();
      expect(next).toHaveBeenCalledWith(expect.any(HttpError));
    });

    it('encaminha 400 quando o parâmetro workId está ausente', async () => {
      const {
        createWorkUseCase,
        listWorksUseCase,
        getWorkBySlugUseCase,
        updateWorkUseCase,
      } = createUseCaseMocks();
      const controller = new WorkController(
        createWorkUseCase,
        listWorksUseCase,
        getWorkBySlugUseCase,
        updateWorkUseCase,
      );

      const response = createResponseMock();
      const next = jest.fn();
      const request = {
        params: {},
        body: { title: 'Novo título' },
      } as unknown as Request;

      await controller.update(request, response, next);

      expect(updateWorkUseCase.execute).not.toHaveBeenCalled();
      expect(next).toHaveBeenCalledWith(expect.any(HttpError));
      expect(response.status).not.toHaveBeenCalled();
    });

    it('encaminha erros do caso de uso (404/409) para o next (AC-003, AC-004)', async () => {
      const {
        createWorkUseCase,
        listWorksUseCase,
        getWorkBySlugUseCase,
        updateWorkUseCase,
      } = createUseCaseMocks();
      const conflictError = new HttpError(
        409,
        'Já existe um trabalho com esse slug.',
      );
      updateWorkUseCase.execute.mockRejectedValue(conflictError);
      const controller = new WorkController(
        createWorkUseCase,
        listWorksUseCase,
        getWorkBySlugUseCase,
        updateWorkUseCase,
      );

      const response = createResponseMock();
      const next = jest.fn();
      const request = {
        params: { workId: 'work-1' },
        body: { slug: 'outro-slug' },
      } as unknown as Request;

      await controller.update(request, response, next);

      expect(next).toHaveBeenCalledWith(conflictError);
      expect(response.status).not.toHaveBeenCalled();
    });
  });
});
