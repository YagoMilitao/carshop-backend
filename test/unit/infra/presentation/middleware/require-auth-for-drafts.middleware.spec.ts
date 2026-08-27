import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { HttpError } from '../../../../../src/core/domain/application/ApplicationError/http-error';
import { buildRequireAuthForDraftsMiddleware } from '../../../../../src/infra/presentation/middleware/require-auth-for-drafts.middleware';

function createRequest(query: Record<string, unknown>): Request {
  return { query } as unknown as Request;
}

describe('buildRequireAuthForDraftsMiddleware', () => {
  it('chama next() diretamente quando includeDrafts está ausente', () => {
    const authMiddleware = jest.fn() as unknown as jest.Mocked<RequestHandler>;
    const middleware = buildRequireAuthForDraftsMiddleware(authMiddleware);

    const request = createRequest({});
    const response = {} as Response;
    const next = jest.fn() as unknown as NextFunction;

    middleware(request, response, next);

    expect(next).toHaveBeenCalledWith();
    expect(authMiddleware).not.toHaveBeenCalled();
  });

  it('chama next() diretamente quando includeDrafts é diferente de "true"', () => {
    const authMiddleware = jest.fn() as unknown as jest.Mocked<RequestHandler>;
    const middleware = buildRequireAuthForDraftsMiddleware(authMiddleware);

    const request = createRequest({ includeDrafts: 'false' });
    const response = {} as Response;
    const next = jest.fn() as unknown as NextFunction;

    middleware(request, response, next);

    expect(next).toHaveBeenCalledWith();
    expect(authMiddleware).not.toHaveBeenCalled();
  });

  it('delega para o authMiddleware quando includeDrafts=true', () => {
    const authMiddleware = jest.fn() as unknown as jest.Mocked<RequestHandler>;
    const middleware = buildRequireAuthForDraftsMiddleware(authMiddleware);

    const request = createRequest({ includeDrafts: 'true' });
    const response = {} as Response;
    const next = jest.fn() as unknown as NextFunction;

    middleware(request, response, next);

    expect(authMiddleware).toHaveBeenCalledWith(request, response, next);
    expect(next).not.toHaveBeenCalled();
  });

  it('propaga o erro 401 do authMiddleware sem alterá-lo quando includeDrafts=true', () => {
    const unauthorizedError = new HttpError(401, 'Token de acesso ausente.');
    const authMiddleware = jest.fn(
      (_request: Request, _response: Response, nextFn: NextFunction) => {
        nextFn(unauthorizedError);
      },
    ) as unknown as jest.Mocked<RequestHandler>;
    const middleware = buildRequireAuthForDraftsMiddleware(authMiddleware);

    const request = createRequest({ includeDrafts: 'true' });
    const response = {} as Response;
    const next = jest.fn() as unknown as NextFunction;

    middleware(request, response, next);

    expect(next).toHaveBeenCalledWith(unauthorizedError);
  });
});
