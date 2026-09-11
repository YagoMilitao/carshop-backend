import type { Response } from 'express';
import {
  clearAuthCookies,
  parseCookies,
  setAuthCookies,
} from '../../../../src/presentation/helpers/auth.cookies';

function createResponseMock() {
  return {
    cookie: jest.fn(),
    clearCookie: jest.fn(),
  } as unknown as Response;
}

describe('auth.cookies', () => {
  const originalEnv = process.env;
  const defaultMaxAge = 7 * 24 * 60 * 60 * 1000;

  beforeEach(() => {
    process.env = { ...originalEnv };
    delete process.env.NODE_ENV;
    delete process.env.JWT_REFRESH_COOKIE_MAX_AGE_MS;
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('sets refresh and csrf cookies with defaults', () => {
    const response = createResponseMock();

    setAuthCookies(response, 'refresh-token', 'csrf-token');

    expect(response.cookie).toHaveBeenNthCalledWith(
      1,
      'refresh_token',
      'refresh-token',
      expect.objectContaining({
        httpOnly: true,
        sameSite: 'none',
        secure: true,
        path: '/auth',
        maxAge: defaultMaxAge,
      }),
    );
    expect(response.cookie).toHaveBeenNthCalledWith(
      2,
      'csrf_token',
      'csrf-token',
      expect.objectContaining({
        httpOnly: false,
        sameSite: 'none',
        secure: true,
        path: '/auth',
        maxAge: defaultMaxAge,
      }),
    );
  });

  it('keeps secure true even outside production (SameSite=None requires Secure)', () => {
    expect(process.env.NODE_ENV).not.toBe('production');
    const response = createResponseMock();

    setAuthCookies(response, 'refresh-token', 'csrf-token');

    expect(response.cookie).toHaveBeenNthCalledWith(
      1,
      'refresh_token',
      'refresh-token',
      expect.objectContaining({ secure: true, sameSite: 'none' }),
    );
    expect(response.cookie).toHaveBeenNthCalledWith(
      2,
      'csrf_token',
      'csrf-token',
      expect.objectContaining({ secure: true, sameSite: 'none' }),
    );
  });

  it('supports production secure cookies and numeric max age override', () => {
    process.env.NODE_ENV = 'production';
    process.env.JWT_REFRESH_COOKIE_MAX_AGE_MS = '1234';
    const response = createResponseMock();

    setAuthCookies(response, 'refresh-token', 'csrf-token');

    expect(response.cookie).toHaveBeenNthCalledWith(
      1,
      'refresh_token',
      'refresh-token',
      expect.objectContaining({
        secure: true,
        sameSite: 'none',
        maxAge: 1234,
      }),
    );
    expect(response.cookie).toHaveBeenNthCalledWith(
      2,
      'csrf_token',
      'csrf-token',
      expect.objectContaining({
        secure: true,
        sameSite: 'none',
        maxAge: 1234,
      }),
    );
  });

  // AC-001: JWT_REFRESH_COOKIE_MAX_AGE_MS is unset (absent).
  it('falls back to the default max age when env value is absent (AC-001)', () => {
    delete process.env.JWT_REFRESH_COOKIE_MAX_AGE_MS;
    const response = createResponseMock();

    setAuthCookies(response, 'refresh-token', 'csrf-token');

    expect(response.cookie).toHaveBeenNthCalledWith(
      1,
      'refresh_token',
      'refresh-token',
      expect.objectContaining({ maxAge: defaultMaxAge }),
    );
    expect(response.cookie).toHaveBeenNthCalledWith(
      2,
      'csrf_token',
      'csrf-token',
      expect.objectContaining({ maxAge: defaultMaxAge }),
    );
  });

  it.each([
    { envValue: '', description: 'an empty string', criterion: 'AC-002' },
    {
      envValue: 'not-a-number',
      description: 'not numeric',
      criterion: 'AC-003',
    },
    { envValue: '0', description: '"0"', criterion: 'AC-004' },
    { envValue: '-1000', description: 'negative', criterion: 'AC-005' },
  ])(
    'falls back to the default max age when env value is $description ($criterion)',
    ({ envValue }) => {
      process.env.JWT_REFRESH_COOKIE_MAX_AGE_MS = envValue;
      const response = createResponseMock();

      setAuthCookies(response, 'refresh-token', 'csrf-token');

      expect(response.cookie).toHaveBeenNthCalledWith(
        1,
        'refresh_token',
        'refresh-token',
        expect.objectContaining({ maxAge: defaultMaxAge }),
      );
      expect(response.cookie).toHaveBeenNthCalledWith(
        2,
        'csrf_token',
        'csrf-token',
        expect.objectContaining({ maxAge: defaultMaxAge }),
      );
    },
  );

  // AC-006: a valid positive value must pass through unchanged, independent
  // of NODE_ENV, scoped strictly to the max-age computation (not conflated
  // with the secure-cookie/production assertions covered elsewhere).
  it('uses the configured value unchanged when it is a valid positive number (AC-006)', () => {
    process.env.JWT_REFRESH_COOKIE_MAX_AGE_MS = '3600000';
    const response = createResponseMock();

    setAuthCookies(response, 'refresh-token', 'csrf-token');

    expect(response.cookie).toHaveBeenNthCalledWith(
      1,
      'refresh_token',
      'refresh-token',
      expect.objectContaining({ maxAge: 3600000 }),
    );
    expect(response.cookie).toHaveBeenNthCalledWith(
      2,
      'csrf_token',
      'csrf-token',
      expect.objectContaining({ maxAge: 3600000 }),
    );
  });

  it('clears both auth cookies using secure defaults', () => {
    process.env.NODE_ENV = 'production';
    const response = createResponseMock();

    clearAuthCookies(response);

    expect(response.clearCookie).toHaveBeenNthCalledWith(
      1,
      'refresh_token',
      expect.objectContaining({
        httpOnly: true,
        sameSite: 'none',
        secure: true,
        path: '/auth',
      }),
    );
    expect(response.clearCookie).toHaveBeenNthCalledWith(
      2,
      'csrf_token',
      expect.objectContaining({
        httpOnly: false,
        sameSite: 'none',
        secure: true,
        path: '/auth',
      }),
    );
  });

  it('keeps secure true when clearing cookies even outside production', () => {
    expect(process.env.NODE_ENV).not.toBe('production');
    const response = createResponseMock();

    clearAuthCookies(response);

    expect(response.clearCookie).toHaveBeenNthCalledWith(
      1,
      'refresh_token',
      expect.objectContaining({ secure: true, sameSite: 'none' }),
    );
    expect(response.clearCookie).toHaveBeenNthCalledWith(
      2,
      'csrf_token',
      expect.objectContaining({ secure: true, sameSite: 'none' }),
    );
  });

  it('parses cookies and decodes url-encoded values', () => {
    const parsed = parseCookies(
      'refresh_token=abc; csrf_token=csrf%20token; malformed',
    );

    expect(parsed).toEqual({
      refresh_token: 'abc',
      csrf_token: 'csrf token',
    });
  });

  it('returns an empty object when cookie header is absent', () => {
    expect(parseCookies(undefined)).toEqual({});
  });
});
