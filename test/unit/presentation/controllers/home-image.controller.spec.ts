import type { Request, Response } from 'express';
import { HttpError } from '../../../../src/core/domain/application/ApplicationError/http-error';
import type { GetHomeImageUseCase } from '../../../../src/usecase/get-home-image.use-case';
import type { SetHomeImageUseCase } from '../../../../src/usecase/set-home-image.use-case';
import { HomeImageController } from '../../../../src/presentation/controllers/home-image.controller';

const WORK_ID = 'cf357670-d168-48b4-a5de-c57dff7858fe';
const IMAGE_ID = '0b7e4a1c-3f2d-4c5e-9a8b-1d2e3f4a5b6c';

const HOME_IMAGE = {
  workId: WORK_ID,
  imageId: IMAGE_ID,
  url: 'https://cdn.example.com/hero.jpg',
  alt: 'Banco reformado',
};

function createResponseMock() {
  return {
    status: jest.fn().mockReturnThis(),
    json: jest.fn(),
  } as unknown as jest.Mocked<Response>;
}

function createController() {
  const getHomeImageUseCase = {
    execute: jest.fn(),
  } as unknown as jest.Mocked<GetHomeImageUseCase>;
  const setHomeImageUseCase = {
    execute: jest.fn(),
  } as unknown as jest.Mocked<SetHomeImageUseCase>;

  return {
    controller: new HomeImageController(
      getHomeImageUseCase,
      setHomeImageUseCase,
    ),
    getHomeImageUseCase,
    setHomeImageUseCase,
  };
}

/**
 * CARSHOP-159 — FR-003/FR-004/FR-005, AC-001/AC-002/AC-003/AC-007/AC-012.
 */
describe('HomeImageController (CARSHOP-159)', () => {
  describe('get', () => {
    it('responds 200 with the configured image (AC-001)', async () => {
      const { controller, getHomeImageUseCase } = createController();
      getHomeImageUseCase.execute.mockResolvedValue(HOME_IMAGE);
      const response = createResponseMock();
      const next = jest.fn();

      await controller.get({} as Request, response, next);

      expect(response.status).toHaveBeenCalledWith(200);
      expect(response.json).toHaveBeenCalledWith({ image: HOME_IMAGE });
      expect(next).not.toHaveBeenCalled();
    });

    it('responds 200 with { image: null } when nothing is configured (AC-002)', async () => {
      const { controller, getHomeImageUseCase } = createController();
      getHomeImageUseCase.execute.mockResolvedValue(null);
      const response = createResponseMock();

      await controller.get({} as Request, response, jest.fn());

      expect(response.status).toHaveBeenCalledWith(200);
      expect(response.json).toHaveBeenCalledWith({ image: null });
    });

    it('exposes only the documented fields even if the use case returns extra ones (AC-012)', async () => {
      const { controller, getHomeImageUseCase } = createController();
      getHomeImageUseCase.execute.mockResolvedValue({
        ...HOME_IMAGE,
        publicId: 'carshop/works/internal-id',
      } as typeof HOME_IMAGE);
      const response = createResponseMock();

      await controller.get({} as Request, response, jest.fn());

      expect(response.json).toHaveBeenCalledWith({ image: HOME_IMAGE });
    });

    it('forwards use case errors to next', async () => {
      const { controller, getHomeImageUseCase } = createController();
      const error = new Error('db down');
      getHomeImageUseCase.execute.mockRejectedValue(error);
      const response = createResponseMock();
      const next = jest.fn();

      await controller.get({} as Request, response, next);

      expect(next).toHaveBeenCalledWith(error);
      expect(response.status).not.toHaveBeenCalled();
    });
  });

  describe('update', () => {
    it('validates the body, calls the use case with the trimmed reference and responds 200 (AC-003)', async () => {
      const { controller, setHomeImageUseCase } = createController();
      setHomeImageUseCase.execute.mockResolvedValue(HOME_IMAGE);
      const response = createResponseMock();
      const next = jest.fn();

      await controller.update(
        { body: { workId: ` ${WORK_ID} `, imageId: IMAGE_ID } } as Request,
        response,
        next,
      );

      expect(setHomeImageUseCase.execute).toHaveBeenCalledWith({
        workId: WORK_ID,
        imageId: IMAGE_ID,
      });
      expect(response.status).toHaveBeenCalledWith(200);
      expect(response.json).toHaveBeenCalledWith({ image: HOME_IMAGE });
      expect(next).not.toHaveBeenCalled();
    });

    it.each([
      ['undefined body', undefined],
      ['missing imageId', { workId: WORK_ID }],
      [
        'arbitrary url',
        { workId: WORK_ID, imageId: IMAGE_ID, url: 'https://x.example.com' },
      ],
    ])(
      'forwards HttpError 400 "Payload inválido." for %s without calling the use case (AC-007/AC-008)',
      async (_label, body) => {
        const { controller, setHomeImageUseCase } = createController();
        const response = createResponseMock();
        const next = jest.fn();

        await controller.update({ body } as Request, response, next);

        expect(setHomeImageUseCase.execute).not.toHaveBeenCalled();
        expect(response.status).not.toHaveBeenCalled();
        expect(next).toHaveBeenCalledWith(expect.any(HttpError));
        expect(next.mock.calls[0][0]).toMatchObject({
          statusCode: 400,
          message: 'Payload inválido.',
        });
      },
    );

    it.each([
      [404, 'Imagem não encontrada.'],
      [
        409,
        'A imagem selecionada não é elegível: o trabalho não está publicado.',
      ],
    ])(
      'forwards use case HttpError %i to next (AC-005/AC-006)',
      async (statusCode, message) => {
        const { controller, setHomeImageUseCase } = createController();
        const error = new HttpError(statusCode, message);
        setHomeImageUseCase.execute.mockRejectedValue(error);
        const response = createResponseMock();
        const next = jest.fn();

        await controller.update(
          { body: { workId: WORK_ID, imageId: IMAGE_ID } } as Request,
          response,
          next,
        );

        expect(next).toHaveBeenCalledWith(error);
        expect(response.status).not.toHaveBeenCalled();
      },
    );
  });
});
