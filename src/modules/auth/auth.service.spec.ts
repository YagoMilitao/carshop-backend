import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { verify } from 'jsonwebtoken';
import { AuthService } from './auth.service';
import { getCsrfCookieName, getRefreshCookieName } from './auth.config';
import { SessionStoreService } from './session-store.service';

describe('AuthService', () => {
  let service: AuthService;
  let sessionStore: SessionStoreService;

  beforeEach(async () => {
    process.env.JWT_SECRET = 'test-secret';
    process.env.ADMIN_EMAIL = 'admin@example.com';
    process.env.ADMIN_PASSWORD = 'super-secret';
    process.env.JWT_EXPIRES_IN = '15m';
    process.env.JWT_REFRESH_EXPIRES_IN = '7d';

    const module: TestingModule = await Test.createTestingModule({
      providers: [AuthService, SessionStoreService],
    }).compile();

    service = module.get<AuthService>(AuthService);
    sessionStore = module.get<SessionStoreService>(SessionStoreService);
  });

  afterEach(() => {
    sessionStore.clear();
    jest.restoreAllMocks();
  });

  it('validates configured admin credentials', () => {
    expect(
      service.validateAdmin('admin@example.com', 'super-secret'),
    ).toEqual({ email: 'admin@example.com' });
  });

  it('rejects invalid admin credentials', () => {
    expect(() => service.validateAdmin('admin@example.com', 'wrong')).toThrow(
      UnauthorizedException,
    );
  });

  it('creates an authenticated session on login', async () => {
    const result = await service.login('admin@example.com');
    const accessPayload = verify(result.accessToken, process.env.JWT_SECRET!);
    const refreshPayload = verify(result.refreshToken, process.env.JWT_SECRET!);

    expect(result.csrfToken).toBeTruthy();
    expect((accessPayload as { type: string }).type).toBe('access');
    expect((refreshPayload as { type: string }).type).toBe('refresh');
    expect(sessionStore.isActive(result.sessionId)).toBe(true);
  });

  it('rotates refresh token and csrf token on refresh', async () => {
    const loginResult = await service.login('admin@example.com');
    const cookieHeader = [
      `${getRefreshCookieName()}=${loginResult.refreshToken}`,
      `${getCsrfCookieName()}=${loginResult.csrfToken}`,
    ].join('; ');

    const refreshed = await service.refresh(cookieHeader, loginResult.csrfToken);

    expect(refreshed.sessionId).toBe(loginResult.sessionId);
    expect(refreshed.accessToken).not.toBe(loginResult.accessToken);
    expect(refreshed.refreshToken).not.toBe(loginResult.refreshToken);
    expect(refreshed.csrfToken).not.toBe(loginResult.csrfToken);
  });

  it('rejects refresh requests with invalid csrf token', async () => {
    const loginResult = await service.login('admin@example.com');
    const cookieHeader = [
      `${getRefreshCookieName()}=${loginResult.refreshToken}`,
      `${getCsrfCookieName()}=${loginResult.csrfToken}`,
    ].join('; ');

    await expect(service.refresh(cookieHeader, 'invalid-csrf')).rejects.toThrow(
      ForbiddenException,
    );
  });

  it('revokes the session on logout', async () => {
    const loginResult = await service.login('admin@example.com');
    const cookieHeader = [
      `${getRefreshCookieName()}=${loginResult.refreshToken}`,
      `${getCsrfCookieName()}=${loginResult.csrfToken}`,
    ].join('; ');

    expect(service.logout(cookieHeader, loginResult.csrfToken)).toEqual({
      success: true,
    });
    expect(() => service.getSession(loginResult.sessionId)).toThrow(
      UnauthorizedException,
    );
  });
});
