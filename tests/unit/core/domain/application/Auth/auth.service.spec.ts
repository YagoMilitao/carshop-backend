import { AuthService } from '../../../../../../src/core/domain/application/Auth/auth.service';
import {
  getCsrfCookieName,
  getRefreshCookieName,
} from '../../../../../../src/infra/constants/auth.constants';
import { InMemorySessionStoreRepository } from '../../../../../../src/infra/repositories/in-memory-session-store.repository';
import { EnvAdminCredentialsProvider } from '../../../../../../src/infra/config/env-admin-credentials.provider';
import { JsonWebTokenService } from '../../../../../../src/infra/services/jsonwebtoken-token.service';
import { HttpError } from '../../../../../../src/core/domain/application/ApplicationError/http-error';

describe('AuthService', () => {
  let service: AuthService;
  let sessionStore: InMemorySessionStoreRepository;

  beforeEach(() => {
    process.env.JWT_SECRET = 'test-secret';
    process.env.ADMIN_EMAIL = 'admin@example.com';
    process.env.ADMIN_PASSWORD = 'super-secret';
    process.env.JWT_EXPIRES_IN = '15m';
    process.env.JWT_REFRESH_EXPIRES_IN = '7d';

    sessionStore = new InMemorySessionStoreRepository();
    service = new AuthService(
      sessionStore,
      new JsonWebTokenService(),
      new EnvAdminCredentialsProvider(),
    );
  });

  afterEach(() => {
    sessionStore.clear();
    jest.restoreAllMocks();
  });

  it('validates configured admin credentials', () => {
    expect(service.validateAdmin('admin@example.com', 'super-secret')).toEqual({
      email: 'admin@example.com',
    });
  });

  it('rejects invalid admin credentials', () => {
    expect(() => service.validateAdmin('admin@example.com', 'wrong')).toThrow(
      HttpError,
    );
  });

  it('creates an authenticated session on login', () => {
    const result = service.login('admin@example.com');

    expect(result.accessToken).toBeTruthy();
    expect(result.refreshToken).toBeTruthy();
    expect(result.csrfToken).toBeTruthy();
    expect(sessionStore.isActive(result.sessionId)).toBe(true);
  });

  it('rotates refresh token and csrf token on refresh', () => {
    const loginResult = service.login('admin@example.com');

    const refreshed = service.refresh({
      refreshToken: loginResult.refreshToken,
      csrfCookieToken: loginResult.csrfToken,
      csrfHeaderToken: loginResult.csrfToken,
    });

    expect(refreshed.sessionId).toBe(loginResult.sessionId);
    expect(refreshed.accessToken).not.toBe(loginResult.accessToken);
    expect(refreshed.refreshToken).not.toBe(loginResult.refreshToken);
    expect(refreshed.csrfToken).not.toBe(loginResult.csrfToken);
  });

  it('rejects refresh requests with invalid csrf token', () => {
    const loginResult = service.login('admin@example.com');

    expect(() =>
      service.refresh({
        refreshToken: loginResult.refreshToken,
        csrfCookieToken: loginResult.csrfToken,
        csrfHeaderToken: 'invalid-csrf',
      }),
    ).toThrow(HttpError);
  });

  it('revokes the session on logout', () => {
    const loginResult = service.login('admin@example.com');

    expect(
      service.logout({
        refreshToken: loginResult.refreshToken,
        csrfCookieToken: loginResult.csrfToken,
        csrfHeaderToken: loginResult.csrfToken,
      }),
    ).toEqual({
      success: true,
    });

    expect(() => service.getSession(loginResult.sessionId)).toThrow(HttpError);
  });

  it('exposes cookie names used by HTTP layer', () => {
    expect(getRefreshCookieName()).toBe('refresh_token');
    expect(getCsrfCookieName()).toBe('csrf_token');
  });
});
