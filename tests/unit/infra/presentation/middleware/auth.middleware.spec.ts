import type { Request, Response } from 'express';
import { HttpError } from '../../../../../src/core/domain/application/ApplicationError/http-error';
import type { SessionStorePort } from '../../../../../src/core/domain/repositories/session-store.repository';
import type { TokenServicePort } from '../../../../../src/core/domain/application/Auth/token-service.port';
import { buildAuthMiddleware } from '../../../../../src/infra/presentation/middleware/auth.middleware';
import { expect, describe, it, jest } from '@jest/globals';

function createSessionStoreMock() {
  return {
    create: jest.fn(),
    findById: jest.fn(),
    update: jest.fn(),
    revoke: jest.fn(),
    isActive: jest.fn(),
    clear: jest.fn(),
  } as unknown as jest.Mocked<SessionStorePort>;
}

function createTokenServiceMock() {
  return {
    sign: jest.fn(),
    verify: jest.fn(),
  } as unknown as jest.Mocked<TokenServicePort>;
}

describe('buildAuthMiddleware', () => {
  it('returns 401 when bearer token is missing', () => {
    const sessionStore = createSessionStoreMock();
    const tokenService = createTokenServiceMock();
    const middleware = buildAuthMiddleware(sessionStore, tokenService);
    const request = { headers: {} } as Request;
    const next = jest.fn();

    middleware(request, {} as Response, next);

    const error = next.mock.calls[0][0] as HttpError;
    expect(error).toBeInstanceOf(HttpError);
    expect(error.statusCode).toBe(401);
    expect(error.message).toBe('Token de acesso ausente.');
  });

  it('returns 401 when token type is not access', () => {
    const sessionStore = createSessionStoreMock();
    const tokenService = createTokenServiceMock();
    tokenService.verify.mockReturnValue({
      sub: 'admin@example.com',
      sid: 'session-id',
      type: 'refresh',
    });
    const middleware = buildAuthMiddleware(sessionStore, tokenService);
    const request = {
      headers: { authorization: 'Bearer some-token' },
    } as Request;
    const next = jest.fn();

    middleware(request, {} as Response, next);

    const error = next.mock.calls[0][0] as HttpError;
    expect(error).toBeInstanceOf(HttpError);
    expect(error.statusCode).toBe(401);
    expect(error.message).toBe('Token inválido para acesso.');
  });

  it('returns 401 when session is inactive', async () => {
    const sessionStore = createSessionStoreMock();
    const tokenService = createTokenServiceMock();
    tokenService.verify.mockReturnValue({
      sub: 'admin@example.com',
      sid: 'session-id',
      type: 'access',
    });
    sessionStore.isActive.mockResolvedValue(false);
    const middleware = buildAuthMiddleware(sessionStore, tokenService);
    const request = {
      headers: { authorization: 'Bearer valid-token' },
    } as Request;
    const next = jest.fn();

    middleware(request, {} as Response, next);

    await new Promise((resolve) => setImmediate(resolve));

    const error = next.mock.calls[0][0] as HttpError;
    expect(error).toBeInstanceOf(HttpError);
    expect(error.statusCode).toBe(401);
    expect(error.message).toBe('Sessão inválida ou expirada.');
  });

  it('adds auth metadata and calls next with no error on success', async () => {
    const sessionStore = createSessionStoreMock();
    const tokenService = createTokenServiceMock();
    tokenService.verify.mockReturnValue({
      sub: 'admin@example.com',
      sid: 'session-id',
      type: 'access',
    });
    sessionStore.isActive.mockResolvedValue(true);
    const middleware = buildAuthMiddleware(sessionStore, tokenService);
    const request = {
      headers: { authorization: 'Bearer valid-token' },
    } as Request & { auth?: { email: string; sessionId: string } };
    const next = jest.fn();

    middleware(request, {} as Response, next);

    await new Promise((resolve) => setImmediate(resolve));

    expect(request.auth).toEqual({
      email: 'admin@example.com',
      sessionId: 'session-id',
    });
    expect(next).toHaveBeenCalledWith();
  });

  it('forwards unexpected errors to the next handler', () => {
    const sessionStore = createSessionStoreMock();
    const tokenService = createTokenServiceMock();
    const unexpectedError = new Error('token failure');
    tokenService.verify.mockImplementation(() => {
      throw unexpectedError;
    });
    const middleware = buildAuthMiddleware(sessionStore, tokenService);
    const request = {
      headers: { authorization: 'Bearer token' },
    } as Request;
    const next = jest.fn();

    middleware(request, {} as Response, next);

    expect(next).toHaveBeenCalledWith(unexpectedError);
  });
});
