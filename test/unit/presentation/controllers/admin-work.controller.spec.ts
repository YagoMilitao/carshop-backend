import type { Request, Response } from 'express';
import { HttpError } from '../../../../src/core/domain/application/ApplicationError/http-error';
import type { HardDeleteWorkUseCase } from '../../../../src/usecase/hard-delete-work.use-case';
import { AdminWorkController } from '../../../../src/presentation/controllers/admin-work.controller';

function createResponseMock() {
  return {
    status: jest.fn().mockReturnThis(),
    json: jest.fn(),
  } as unknown as Response;
}

function createHardDeleteUseCaseMock() {
  return {
    execute: jest.fn(),
  } as unknown as jest.Mocked<HardDeleteWorkUseCase>;
}

describe('AdminWorkController', () => {
  it('validates the workId param and calls the hard delete use case, responding 200 (AC-005)', async () => {
    const hardDeleteUseCase = createHardDeleteUseCaseMock();
    hardDeleteUseCase.execute.mockResolvedValue({ success: true });
    const controller = new AdminWorkController(hardDeleteUseCase);

    const response = createResponseMock();
    const next = jest.fn();

    const request = {
      params: { workId: 'work-1' },
    } as unknown as Request<{ workId: string }>;

    await controller.hardDelete(request, response, next);

    expect(hardDeleteUseCase.execute).toHaveBeenCalledWith('work-1');
    expect(response.status).toHaveBeenCalledWith(200);
    expect(response.json).toHaveBeenCalledWith({ success: true });
    expect(next).not.toHaveBeenCalled();
  });

  it('forwards a 400 error to next when workId param is missing', async () => {
    const hardDeleteUseCase = createHardDeleteUseCaseMock();
    const controller = new AdminWorkController(hardDeleteUseCase);

    const response = createResponseMock();
    const next = jest.fn();

    const request = {
      params: { workId: '' },
    } as unknown as Request<{ workId: string }>;

    await controller.hardDelete(request, response, next);

    expect(hardDeleteUseCase.execute).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledWith(expect.any(HttpError));
  });

  it('forwards use case errors (e.g. 404/502) to next', async () => {
    const hardDeleteUseCase = createHardDeleteUseCaseMock();
    hardDeleteUseCase.execute.mockRejectedValue(
      new HttpError(502, 'Falha ao remover arquivos do armazenamento externo. Tente novamente.'),
    );
    const controller = new AdminWorkController(hardDeleteUseCase);

    const response = createResponseMock();
    const next = jest.fn();

    const request = {
      params: { workId: 'work-1' },
    } as unknown as Request<{ workId: string }>;

    await controller.hardDelete(request, response, next);

    expect(next).toHaveBeenCalledWith(expect.any(HttpError));
    expect(response.status).not.toHaveBeenCalled();
  });
});
