import type { Response } from 'express';
import { HttpError } from '../../../../../src/core/domain/application/ApplicationError/http-error';
import { errorHandlerMiddleware } from '../../../../../src/infra/presentation/middleware/error-handler.middleware';

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

  it('returns a 413 message for payload-too-large errors from the body parser', () => {
    const response = createResponseMock();
    const error = new Error('request entity too large') as Error & {
      type?: string;
      statusCode?: number;
      status?: number;
    };
    error.type = 'entity.too.large';
    error.statusCode = 413;
    error.status = 413;

    errorHandlerMiddleware(error, {} as never, response, jest.fn());

    expect(response.status).toHaveBeenCalledWith(413);
    expect(response.json).toHaveBeenCalledWith({
      message: 'Corpo da requisição excede o limite permitido.',
    });
  });

  it('returns 413 when only status (not statusCode) is 413 alongside the correct type', () => {
    const response = createResponseMock();
    const error = new Error('request entity too large') as Error & {
      type?: string;
      status?: number;
    };
    error.type = 'entity.too.large';
    error.status = 413;

    errorHandlerMiddleware(error, {} as never, response, jest.fn());

    expect(response.status).toHaveBeenCalledWith(413);
    expect(response.json).toHaveBeenCalledWith({
      message: 'Corpo da requisição excede o limite permitido.',
    });
  });

  it('falls through to the generic 500 branch when the thrown value is not an Error instance', () => {
    const response = createResponseMock();
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
    const nonErrorValue = { type: 'entity.too.large', statusCode: 413 };

    errorHandlerMiddleware(nonErrorValue, {} as never, response, jest.fn());

    expect(consoleSpy).toHaveBeenCalledWith(nonErrorValue);
    expect(response.status).toHaveBeenCalledWith(500);
    expect(response.json).toHaveBeenCalledWith({
      message: 'Erro interno no servidor.',
    });

    consoleSpy.mockRestore();
  });

  it('falls through to the generic 500 branch when only one of type/statusCode is set', () => {
    const response = createResponseMock();
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
    const error = new Error('unrelated error with a stray 413 status') as Error & {
      type?: string;
      statusCode?: number;
      status?: number;
    };
    error.statusCode = 413;

    errorHandlerMiddleware(error, {} as never, response, jest.fn());

    expect(consoleSpy).toHaveBeenCalledWith(error);
    expect(response.status).toHaveBeenCalledWith(500);
    expect(response.json).toHaveBeenCalledWith({
      message: 'Erro interno no servidor.',
    });

    consoleSpy.mockRestore();
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
