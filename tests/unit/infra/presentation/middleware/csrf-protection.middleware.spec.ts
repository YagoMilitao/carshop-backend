import type { Request, Response } from 'express';
import { HttpError } from '../../../../../src/core/domain/application/ApplicationError/http-error';
import { csrfProtectionMiddleware } from '../../../../../src/infra/presentation/middleware/csrf-protection.middleware';

describe('csrfProtectionMiddleware', () => {
  it('returns 403 when csrf cookie is missing', () => {
    const request = {
      headers: {},
      header: jest.fn().mockReturnValue('csrf-token'),
    } as unknown as Request;
    const next = jest.fn();

    csrfProtectionMiddleware(request, {} as Response, next);

    const error = next.mock.calls[0][0] as HttpError;
    expect(error).toBeInstanceOf(HttpError);
    expect(error.statusCode).toBe(403);
    expect(error.message).toBe('Falha na validação CSRF.');
  });

  it('returns 403 when csrf header token does not match cookie token', () => {
    const request = {
      headers: { cookie: 'csrf_token=cookie-value' },
      header: jest.fn().mockReturnValue('header-value'),
    } as unknown as Request;
    const next = jest.fn();

    csrfProtectionMiddleware(request, {} as Response, next);

    const error = next.mock.calls[0][0] as HttpError;
    expect(error).toBeInstanceOf(HttpError);
    expect(error.statusCode).toBe(403);
    expect(error.message).toBe('Falha na validação CSRF.');
  });

  it('calls next with no error when csrf validation succeeds', () => {
    const request = {
      headers: { cookie: 'csrf_token=valid-token' },
      header: jest.fn().mockReturnValue('valid-token'),
    } as unknown as Request;
    const next = jest.fn();

    csrfProtectionMiddleware(request, {} as Response, next);

    expect(next).toHaveBeenCalledWith();
  });
});
