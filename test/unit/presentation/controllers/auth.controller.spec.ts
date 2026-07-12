import type { Request, Response } from 'express';
import { HttpError } from '../../../../src/core/domain/application/ApplicationError/http-error';
import type { AuthService } from '../../../../src/core/domain/application/Auth/auth.service';
import { AuthController } from '../../../../src/presentation/controllers/auth.controller';
import {
  expect,
  describe,
  it,
  beforeAll,
  beforeEach,
  afterAll,
  jest,
} from '@jest/globals';

function createResponseMock() {
  return {
    cookie: jest.fn().mockReturnThis(),
    clearCookie: jest.fn().mockReturnThis(),
    status: jest.fn().mockReturnThis(),
    json: jest.fn(),
  } as unknown as Response;
}

function createAuthServiceMock() {
  return {
    validateAdmin: jest.fn(),
    login: jest.fn(),
    refresh: jest.fn(),
    logout: jest.fn(),
    getSession: jest.fn(),
  } as unknown as jest.Mocked<AuthService>;
}

describe('AuthController', () => {
  it('handles login successfully', async () => {
    const authService = createAuthServiceMock();
    authService.login.mockResolvedValue({
      accessToken: 'access-token',
      refreshToken: 'refresh-token',
      csrfToken: 'csrf-token',
      sessionId: 'session-id',
      tokenType: 'Bearer',
    });
    const controller = new AuthController(authService);
    const request = {
      body: {
        email: 'admin@example.com',
        password: 'super-secret',
      },
    } as Request;
    const response = createResponseMock();
    const next = jest.fn();

    await controller.login(request, response, next);

    expect(authService.validateAdmin).toHaveBeenCalledWith(
      'admin@example.com',
      'super-secret',
    );
    expect(authService.login).toHaveBeenCalledWith('admin@example.com');
    expect(response.cookie).toHaveBeenCalledTimes(2);
    expect(response.status).toHaveBeenCalledWith(200);
    expect(response.json).toHaveBeenCalledWith({
      accessToken: 'access-token',
      sessionId: 'session-id',
      tokenType: 'Bearer',
    });
  });

  it('forwards login errors to next middleware', () => {
    const authService = createAuthServiceMock();
    const controller = new AuthController(authService);
    const response = createResponseMock();
    const next = jest.fn();

    controller.login({ body: null } as Request, response, next);

    expect(next).toHaveBeenCalledWith(expect.any(HttpError));
  });

  it('handles refresh successfully', async () => {
    const authService = createAuthServiceMock();
    authService.refresh.mockResolvedValue({
      accessToken: 'new-access-token',
      refreshToken: 'refresh-token',
      csrfToken: 'csrf-token',
      sessionId: 'session-id',
      tokenType: 'Bearer',
    });
    const controller = new AuthController(authService);
    const request = {
      headers: {
        cookie: 'refresh_token=refresh-token; csrf_token=csrf-token',
      },
      header: jest.fn().mockReturnValue('csrf-token'),
    } as unknown as Request;
    const response = createResponseMock();
    const next = jest.fn();

    await controller.refresh(request, response, next);

    expect(authService.refresh).toHaveBeenCalledWith({
      refreshToken: 'refresh-token',
      csrfCookieToken: 'csrf-token',
      csrfHeaderToken: 'csrf-token',
    });
    expect(response.cookie).toHaveBeenCalledTimes(2);
    expect(response.status).toHaveBeenCalledWith(200);
    expect(response.json).toHaveBeenCalledWith({
      accessToken: 'new-access-token',
      sessionId: 'session-id',
      tokenType: 'Bearer',
    });
  });

  it('forwards refresh errors to next middleware', () => {
    const authService = createAuthServiceMock();
    authService.refresh.mockImplementation(() => {
      throw new HttpError(401, 'Refresh token inválido.');
    });
    const controller = new AuthController(authService);
    const request = {
      headers: {
        cookie: 'refresh_token=invalid; csrf_token=csrf-token',
      },
      header: jest.fn().mockReturnValue('csrf-token'),
    } as unknown as Request;
    const response = createResponseMock();
    const next = jest.fn();

    controller.refresh(request, response, next);

    expect(next).toHaveBeenCalledWith(expect.any(HttpError));
  });

  it('handles logout successfully', async () => {
    const authService = createAuthServiceMock();
    authService.logout.mockResolvedValue({ success: true });
    const controller = new AuthController(authService);
    const request = {
      headers: {
        cookie: 'refresh_token=refresh-token; csrf_token=csrf-token',
      },
      header: jest.fn().mockReturnValue('csrf-token'),
    } as unknown as Request;
    const response = createResponseMock();
    const next = jest.fn();

    await controller.logout(request, response, next);

    expect(authService.logout).toHaveBeenCalledWith({
      refreshToken: 'refresh-token',
      csrfCookieToken: 'csrf-token',
      csrfHeaderToken: 'csrf-token',
    });
    expect(response.clearCookie).toHaveBeenCalledTimes(2);
    expect(response.status).toHaveBeenCalledWith(200);
    expect(response.json).toHaveBeenCalledWith({ success: true });
  });

  it('handles getSession and forwards errors', async () => {
    const authService = createAuthServiceMock();
    authService.getSession.mockResolvedValue({
      sessionId: 'session-id',
      email: 'admin@example.com',
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
    });
    const controller = new AuthController(authService);
    const response = createResponseMock();
    const next = jest.fn();

    await controller.getSession(
      {
        auth: { sessionId: 'session-id' },
      } as unknown as Request,
      response,
      next,
    );

    expect(authService.getSession).toHaveBeenCalledWith('session-id');
    expect(response.status).toHaveBeenCalledWith(200);
    expect(response.json).toHaveBeenCalledTimes(1);

    authService.getSession.mockImplementation(() => {
      throw new HttpError(401, 'Sessão inválida ou expirada.');
    });

    await controller.getSession(
      {
        auth: { sessionId: 'session-id' },
      } as unknown as Request,
      response,
      next,
    );

    expect(next).toHaveBeenCalledWith(expect.any(HttpError));
  });
});
