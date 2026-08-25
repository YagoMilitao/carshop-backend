import type { Request, Response } from 'express';
import { HttpError } from '../../../../src/core/domain/application/ApplicationError/http-error';
import type { UploadWorkImageUseCase } from '../../../../src/usecase/upload-work-image.use-case';
import type { DeleteWorkImageUseCase } from '../../../../src/usecase/delete-work-image.use-case';
import { WorkImageController } from '../../../../src/presentation/controllers/work-image.controller';

function createResponseMock() {
  return {
    status: jest.fn().mockReturnThis(),
    json: jest.fn(),
  } as unknown as Response;
}

function createUploadUseCaseMock() {
  return {
    execute: jest.fn(),
  } as unknown as jest.Mocked<UploadWorkImageUseCase>;
}

function createDeleteUseCaseMock() {
  return {
    execute: jest.fn(),
  } as unknown as jest.Mocked<DeleteWorkImageUseCase>;
}

describe('WorkImageController', () => {
  describe('upload', () => {
    it('calls the use case with data extracted from the multipart request and responds 201', async () => {
      const uploadUseCase = createUploadUseCaseMock();
      uploadUseCase.execute.mockResolvedValue(undefined);
      const deleteUseCase = createDeleteUseCaseMock();
      const controller = new WorkImageController(uploadUseCase, deleteUseCase);

      const response = createResponseMock();
      const next = jest.fn();

      const request = {
        params: { workId: 'work-1' },
        body: { alt: 'Descrição da imagem', isCover: 'true' },
        file: {
          path: '/tmp/uploads/file.png',
          mimetype: 'image/png',
          originalname: 'photo.png',
        },
      } as unknown as Request<
        { workId: string },
        unknown,
        { alt?: unknown; isCover?: unknown }
      >;

      await controller.upload(request, response, next);

      expect(uploadUseCase.execute).toHaveBeenCalledWith({
        workId: 'work-1',
        filePath: '/tmp/uploads/file.png',
        mimeType: 'image/png',
        originalName: 'photo.png',
        alt: 'Descrição da imagem',
        isCover: true,
      });
      expect(response.status).toHaveBeenCalledWith(201);
      expect(response.json).toHaveBeenCalledWith({
        message: 'Imagem adicionada com sucesso.',
      });
      expect(next).not.toHaveBeenCalled();
    });

    it('forwards a 400 error to next when workId is missing', async () => {
      const uploadUseCase = createUploadUseCaseMock();
      const deleteUseCase = createDeleteUseCaseMock();
      const controller = new WorkImageController(uploadUseCase, deleteUseCase);

      const response = createResponseMock();
      const next = jest.fn();

      const request = {
        params: { workId: '' },
        body: {},
        file: undefined,
      } as unknown as Request<
        { workId: string },
        unknown,
        { alt?: unknown; isCover?: unknown }
      >;

      await controller.upload(request, response, next);

      expect(uploadUseCase.execute).not.toHaveBeenCalled();
      expect(next).toHaveBeenCalledWith(expect.any(HttpError));
    });

    it('forwards a 400 error to next when no file is provided', async () => {
      const uploadUseCase = createUploadUseCaseMock();
      const deleteUseCase = createDeleteUseCaseMock();
      const controller = new WorkImageController(uploadUseCase, deleteUseCase);

      const response = createResponseMock();
      const next = jest.fn();

      const request = {
        params: { workId: 'work-1' },
        body: {},
        file: undefined,
      } as unknown as Request<
        { workId: string },
        unknown,
        { alt?: unknown; isCover?: unknown }
      >;

      await controller.upload(request, response, next);

      expect(uploadUseCase.execute).not.toHaveBeenCalled();
      expect(next).toHaveBeenCalledWith(expect.any(HttpError));
    });

    it('forwards use case errors to next', async () => {
      const uploadUseCase = createUploadUseCaseMock();
      uploadUseCase.execute.mockRejectedValue(new HttpError(404, 'not found'));
      const deleteUseCase = createDeleteUseCaseMock();
      const controller = new WorkImageController(uploadUseCase, deleteUseCase);

      const response = createResponseMock();
      const next = jest.fn();

      const request = {
        params: { workId: 'work-1' },
        body: {},
        file: {
          path: '/tmp/uploads/file.png',
          mimetype: 'image/png',
          originalname: 'photo.png',
        },
      } as unknown as Request<
        { workId: string },
        unknown,
        { alt?: unknown; isCover?: unknown }
      >;

      await controller.upload(request, response, next);

      expect(next).toHaveBeenCalledWith(expect.any(HttpError));
    });
  });

  describe('delete', () => {
    it('validates route params and calls the delete use case (AC-004)', async () => {
      const uploadUseCase = createUploadUseCaseMock();
      const deleteUseCase = createDeleteUseCaseMock();
      deleteUseCase.execute.mockResolvedValue({ success: true });
      const controller = new WorkImageController(uploadUseCase, deleteUseCase);

      const response = createResponseMock();
      const next = jest.fn();

      const request = {
        params: { workId: 'work-1', imageId: 'image-1' },
      } as unknown as Request<{ workId: string; imageId: string }>;

      await controller.delete(request, response, next);

      expect(deleteUseCase.execute).toHaveBeenCalledWith({
        workId: 'work-1',
        imageId: 'image-1',
      });
      expect(response.status).toHaveBeenCalledWith(200);
      expect(response.json).toHaveBeenCalledWith({ success: true });
      expect(next).not.toHaveBeenCalled();
    });

    it('forwards a 400 error to next when imageId param is missing', async () => {
      const uploadUseCase = createUploadUseCaseMock();
      const deleteUseCase = createDeleteUseCaseMock();
      const controller = new WorkImageController(uploadUseCase, deleteUseCase);

      const response = createResponseMock();
      const next = jest.fn();

      const request = {
        params: { workId: 'work-1', imageId: '' },
      } as unknown as Request<{ workId: string; imageId: string }>;

      await controller.delete(request, response, next);

      expect(deleteUseCase.execute).not.toHaveBeenCalled();
      expect(next).toHaveBeenCalledWith(expect.any(HttpError));
    });

    it('forwards use case errors (e.g. 404) to next', async () => {
      const uploadUseCase = createUploadUseCaseMock();
      const deleteUseCase = createDeleteUseCaseMock();
      deleteUseCase.execute.mockRejectedValue(
        new HttpError(404, 'Imagem não encontrada.'),
      );
      const controller = new WorkImageController(uploadUseCase, deleteUseCase);

      const response = createResponseMock();
      const next = jest.fn();

      const request = {
        params: { workId: 'work-1', imageId: 'missing' },
      } as unknown as Request<{ workId: string; imageId: string }>;

      await controller.delete(request, response, next);

      expect(next).toHaveBeenCalledWith(expect.any(HttpError));
    });
  });
});
