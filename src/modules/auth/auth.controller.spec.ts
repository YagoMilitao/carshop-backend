import { Test, TestingModule } from '@nestjs/testing';
import type { Request, Response } from 'express';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';

describe('AuthController', () => {
  let controller: AuthController;
  const authServiceMock = {
    validateAdmin: jest.fn(),
    login: jest.fn(),
    refresh: jest.fn(),
    logout: jest.fn(),
    getSession: jest.fn(),
  };

  const responseMock = {
    cookie: jest.fn(),
    clearCookie: jest.fn(),
  } as unknown as Response;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [
        {
          provide: AuthService,
          useValue: authServiceMock,
        },
      ],
    }).compile();

    controller = module.get<AuthController>(AuthController);
  });

  it('returns access token and sets cookies on login', async () => {
    authServiceMock.login.mockResolvedValue({
      accessToken: 'access',
      refreshToken: 'refresh',
      csrfToken: 'csrf',
      sessionId: 'session-1',
      tokenType: 'Bearer',
    });

    const result = await controller.login(
      { email: 'admin@example.com', password: 'secret' },
      responseMock,
    );

    expect(authServiceMock.validateAdmin).toHaveBeenCalledWith(
      'admin@example.com',
      'secret',
    );
    expect(authServiceMock.login).toHaveBeenCalledWith('admin@example.com');
    expect(responseMock.cookie).toHaveBeenCalledTimes(2);
    expect(result).toEqual({
      accessToken: 'access',
      sessionId: 'session-1',
      tokenType: 'Bearer',
    });
  });

  it('refreshes a session', async () => {
    authServiceMock.refresh.mockResolvedValue({
      accessToken: 'access-2',
      refreshToken: 'refresh-2',
      csrfToken: 'csrf-2',
      sessionId: 'session-1',
      tokenType: 'Bearer',
    });

    const result = await controller.refresh(
      { headers: { cookie: 'refresh_token=abc' } } as Request,
      'csrf-1',
      responseMock,
    );

    expect(authServiceMock.refresh).toHaveBeenCalledWith(
      'refresh_token=abc',
      'csrf-1',
    );
    expect(responseMock.cookie).toHaveBeenCalledTimes(2);
    expect(result.accessToken).toBe('access-2');
  });

  it('clears cookies on logout', () => {
    authServiceMock.logout.mockReturnValue({ success: true });

    const result = controller.logout(
      { headers: { cookie: 'refresh_token=abc' } } as Request,
      'csrf-1',
      responseMock,
    );

    expect(authServiceMock.logout).toHaveBeenCalledWith(
      'refresh_token=abc',
      'csrf-1',
    );
    expect(responseMock.clearCookie).toHaveBeenCalledTimes(2);
    expect(result).toEqual({ success: true });
  });

  it('returns the current session', () => {
    authServiceMock.getSession.mockReturnValue({ sessionId: 'session-1' });

    const result = controller.getSession({
      auth: { email: 'admin@example.com', sessionId: 'session-1' },
    } as Request);

    expect(authServiceMock.getSession).toHaveBeenCalledWith('session-1');
    expect(result).toEqual({ sessionId: 'session-1' });
  });
});
