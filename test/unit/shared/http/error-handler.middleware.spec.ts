import type { Response } from 'express';
import { HttpError } from '../../../../src/shared/errors/http-error';
import { errorHandlerMiddleware } from '../../../../src/shared/http/error-handler.middleware';

function createResponseMock() {
  return {
    status: jest.fn().mockReturnThis(),
    json: jest.fn(),
  } as unknown as Response;
}

describe('errorHandlerMiddleware', () => {
  it('maps HttpError into the expected response payload', () => {
    const response = createResponseMock();

    errorHandlerMiddleware(
      new HttpError(422, 'Dados inválidos.', { field: 'email' }),
      {} as never,
      response,
      jest.fn(),
    );

    expect(response.status).toHaveBeenCalledWith(422);
    expect(response.json).toHaveBeenCalledWith({
      message: 'Dados inválidos.',
      details: { field: 'email' },
    });
  });

  it('returns a 400 message for malformed json syntax errors', () => {
    const response = createResponseMock();
    const error = new SyntaxError('Unexpected token') as SyntaxError & {
      body: string;
    };
    error.body = '{"broken":';

    errorHandlerMiddleware(error, {} as never, response, jest.fn());

    expect(response.status).toHaveBeenCalledWith(400);
    expect(response.json).toHaveBeenCalledWith({
      message: 'JSON inválido no corpo da requisição.',
    });
  });

  it('returns 500 and logs unexpected errors', () => {
    const response = createResponseMock();
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
    const unexpectedError = new Error('database down');

    errorHandlerMiddleware(unexpectedError, {} as never, response, jest.fn());

    expect(consoleSpy).toHaveBeenCalledWith(unexpectedError);
    expect(response.status).toHaveBeenCalledWith(500);
    expect(response.json).toHaveBeenCalledWith({
      message: 'Erro interno no servidor.',
    });

    consoleSpy.mockRestore();
  });
});
