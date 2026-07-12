import { HttpError } from '../../../../src/core/domain/application/ApplicationError/http-error';
import { validateLoginPayload } from '../../../../src/presentation/helpers/login.validator';

describe('validateLoginPayload', () => {
  it('returns sanitized login data for valid payload', () => {
    expect(
      validateLoginPayload({
        email: '  admin@example.com ',
        password: 'super-secret',
      }),
    ).toEqual({
      email: 'admin@example.com',
      password: 'super-secret',
    });
  });

  it('throws when payload is null or not an object', () => {
    expect(() => validateLoginPayload(null)).toThrow(HttpError);
    expect(() => validateLoginPayload('invalid')).toThrow(HttpError);
  });

  it('throws when email is missing or malformed', () => {
    expect(() => validateLoginPayload({ password: 'secret' })).toThrow(
      HttpError,
    );
    expect(() =>
      validateLoginPayload({ email: 'invalid-email', password: 'secret' }),
    ).toThrow(HttpError);
  });

  it('throws when password is missing or empty', () => {
    expect(() =>
      validateLoginPayload({ email: 'admin@example.com', password: '' }),
    ).toThrow(HttpError);
    expect(() =>
      validateLoginPayload({ email: 'admin@example.com', password: '   ' }),
    ).toThrow(HttpError);
    expect(() =>
      validateLoginPayload({ email: 'admin@example.com', password: null }),
    ).toThrow(HttpError);
  });
});
