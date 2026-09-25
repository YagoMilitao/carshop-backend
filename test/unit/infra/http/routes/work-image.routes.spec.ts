import multer from 'multer';
import { HttpError } from '../../../../../src/core/domain/application/ApplicationError/http-error';

const mockPost = jest.fn();
const mockDelete = jest.fn();
const mockRouterInstance = {
  post: mockPost,
  delete: mockDelete,
};
const mockRouterFactory = jest.fn(() => mockRouterInstance);

const mockBuildAuthMiddleware = jest.fn(() => 'auth-middleware');
const mockMulterSingleHandler = jest.fn();
const mockSingle = jest.fn(() => mockMulterSingleHandler);
const mockController = {
  upload: 'upload-handler',
  delete: 'delete-handler',
};
const mockWorkImageControllerFactory = jest.fn(() => mockController);

jest.mock('express', () => ({
  Router: mockRouterFactory,
}));

jest.mock(
  '../../../../../src/infra/presentation/middleware/auth.middleware',
  () => ({
    buildAuthMiddleware: (sessionStore: unknown, tokenService: unknown) =>
      (
        mockBuildAuthMiddleware as unknown as (
          a: unknown,
          b: unknown,
        ) => unknown
      )(sessionStore, tokenService),
  }),
);

jest.mock('@/infra/middleware/upload.middleware', () => ({
  UnsupportedImageTypeError: jest.requireActual<
    typeof import('../../../../../src/infra/middleware/upload.middleware')
  >('../../../../../src/infra/middleware/upload.middleware')
    .UnsupportedImageTypeError,
  uploadMiddleware: {
    single: (...args: unknown[]) =>
      (mockSingle as unknown as (...a: unknown[]) => unknown)(...args),
  },
}));

jest.mock('@/infra/middleware/image-content-validation.middleware', () => ({
  imageContentValidationMiddleware: 'image-content-validation-handler',
}));

jest.mock(
  '../../../../../src/presentation/controllers/work-image.controller',
  () => ({
    WorkImageController: function MockWorkImageController(
      uploadUseCase: unknown,
      deleteUseCase: unknown,
    ) {
      return (
        mockWorkImageControllerFactory as unknown as (
          a: unknown,
          b: unknown,
        ) => unknown
      )(uploadUseCase, deleteUseCase);
    },
  }),
);

import {
  buildWorkImageRouter,
  translateUploadError,
  withUploadErrorTranslation,
} from '../../../../../src/infra/http/routes/work-image.routes';
import { UnsupportedImageTypeError } from '../../../../../src/infra/middleware/upload.middleware';

const LEGACY_GENERIC_MESSAGE = 'Falha ao processar o upload da imagem.';
const MALFORMED_MESSAGE =
  'Corpo multipart malformado. Verifique o formato da requisição.';
const FIELD_LIMITS_MESSAGE =
  'Os campos do formulário excedem os limites permitidos.';

/**
 * `@types/multer` lags behind multer 2.x runtime codes (e.g.
 * `LIMIT_FIELD_NESTING`, `STREAM_DESTROYED`, `INVALID_FIELD_NAME`), so a
 * real `MulterError` is created and its `code` is overridden, matching what
 * multer produces at runtime without an unsafe cast.
 */
function buildMulterError(code: string, field?: string): multer.MulterError {
  const multerError = new multer.MulterError('LIMIT_PART_COUNT', field);
  Object.defineProperty(multerError, 'code', { value: code });
  return multerError;
}

function expectHttpError(
  translated: unknown,
  statusCode: number,
  message: string,
): void {
  expect(translated).toBeInstanceOf(HttpError);
  expect(translated).toMatchObject({ statusCode, message });
}

describe('buildWorkImageRouter', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  function buildRouter() {
    const workRepository = { name: 'work-repository' } as never;
    const imageStorage = { name: 'image-storage' } as never;
    const sessionStore = { name: 'session-store' } as never;
    const tokenService = { name: 'token-service' } as never;

    return buildWorkImageRouter(
      workRepository,
      imageStorage,
      sessionStore,
      tokenService,
    );
  }

  it('registers the upload and delete routes behind authMiddleware (AC-009)', () => {
    const router = buildRouter();

    expect(router).toBe(mockRouterInstance);
    expect(mockBuildAuthMiddleware).toHaveBeenCalled();
    expect(mockSingle).toHaveBeenCalledWith('file');

    expect(mockPost).toHaveBeenCalledWith(
      '/:workId/images',
      'auth-middleware',
      expect.any(Function),
      'image-content-validation-handler',
      'upload-handler',
    );

    expect(mockDelete).toHaveBeenCalledWith(
      '/:workId/images/:imageId',
      'auth-middleware',
      'delete-handler',
    );
  });

  it('wraps the Multer handler so that its errors are translated before reaching next', () => {
    buildRouter();
    const uploadCall = mockPost.mock.calls.find(
      (call) => call[0] === '/:workId/images',
    );
    if (!uploadCall) {
      throw new Error('upload route was not registered');
    }
    const wrappedMulter = uploadCall[2] as (
      request: unknown,
      response: unknown,
      next: jest.Mock,
    ) => void;
    mockMulterSingleHandler.mockImplementation(
      (
        _request: unknown,
        _response: unknown,
        callback: (e?: unknown) => void,
      ) => callback(new multer.MulterError('LIMIT_UNEXPECTED_FILE', 'image')),
    );
    const next = jest.fn();

    wrappedMulter({}, {}, next);

    expect(mockMulterSingleHandler).toHaveBeenCalledTimes(1);
    expectHttpError(
      next.mock.calls[0][0],
      400,
      'Campo de arquivo inesperado. Envie a imagem no campo "file".',
    );
  });
});

describe('withUploadErrorTranslation', () => {
  it('calls next() with no arguments when the wrapped handler succeeds', () => {
    const handler = jest.fn(
      (_request: unknown, _response: unknown, callback: () => void) =>
        callback(),
    );
    const next = jest.fn();

    withUploadErrorTranslation(handler as never)(
      {} as never,
      {} as never,
      next,
    );

    expect(next).toHaveBeenCalledTimes(1);
    expect(next).toHaveBeenCalledWith();
  });

  it('calls next(translated) when the wrapped handler fails', () => {
    const handler = jest.fn(
      (
        _request: unknown,
        _response: unknown,
        callback: (error: unknown) => void,
      ) => callback(new multer.MulterError('LIMIT_FILE_SIZE')),
    );
    const next = jest.fn();

    withUploadErrorTranslation(handler as never)(
      {} as never,
      {} as never,
      next,
    );

    expect(next).toHaveBeenCalledTimes(1);
    expectHttpError(
      next.mock.calls[0][0],
      413,
      'A imagem ultrapassa o limite de 5 MB.',
    );
  });
});

describe('translateUploadError (CARSHOP-156 AC-007/AC-008)', () => {
  it('passes an existing HttpError through unchanged', () => {
    const httpError = new HttpError(401, 'Token inválido ou ausente.');

    expect(translateUploadError(httpError)).toBe(httpError);
  });

  it('maps UnsupportedImageTypeError to 415 with the existing public message', () => {
    expectHttpError(
      translateUploadError(new UnsupportedImageTypeError()),
      415,
      'Tipo de arquivo não suportado. Envie JPEG, PNG ou WebP.',
    );
  });

  it('maps LIMIT_FILE_SIZE to 413', () => {
    expectHttpError(
      translateUploadError(new multer.MulterError('LIMIT_FILE_SIZE', 'file')),
      413,
      'A imagem ultrapassa o limite de 5 MB.',
    );
  });

  it('maps LIMIT_UNEXPECTED_FILE to a specific 400 without echoing the field name', () => {
    const translated = translateUploadError(
      new multer.MulterError('LIMIT_UNEXPECTED_FILE', 'image'),
    );

    expectHttpError(
      translated,
      400,
      'Campo de arquivo inesperado. Envie a imagem no campo "file".',
    );
    expect((translated as HttpError).message).not.toContain('image"');
  });

  it('maps LIMIT_FILE_COUNT to a specific 400', () => {
    expectHttpError(
      translateUploadError(new multer.MulterError('LIMIT_FILE_COUNT')),
      400,
      'Envie apenas uma imagem por requisição.',
    );
  });

  it.each([
    'LIMIT_FIELD_KEY',
    'LIMIT_FIELD_VALUE',
    'LIMIT_FIELD_COUNT',
    'LIMIT_PART_COUNT',
    'LIMIT_FIELD_NESTING',
    'LIMIT_FIELD_ARRAY_INDEX',
  ])('maps %s to the field-limits 400', (code) => {
    expectHttpError(
      translateUploadError(buildMulterError(code, 'some-field')),
      400,
      FIELD_LIMITS_MESSAGE,
    );
  });

  it.each(['MISSING_FIELD_NAME', 'INVALID_FIELD_NAME', 'STREAM_DESTROYED'])(
    'maps %s to the malformed-multipart 400',
    (code) => {
      expectHttpError(
        translateUploadError(buildMulterError(code)),
        400,
        MALFORMED_MESSAGE,
      );
    },
  );

  it.each([
    'Unexpected end of form',
    'Malformed part header',
    'Multipart: Boundary not found',
    'Request aborted',
  ])(
    'maps busboy/parser error "%s" to the malformed-multipart 400 without echoing it',
    (rawMessage) => {
      const translated = translateUploadError(new Error(rawMessage));

      expectHttpError(translated, 400, MALFORMED_MESSAGE);
      expect((translated as HttpError).message).not.toContain(rawMessage);
    },
  );

  it('passes system errors (errno/syscall) through unchanged so the central handler returns 500', () => {
    const diskError = Object.assign(new Error('ENOSPC: no space left'), {
      errno: -28,
      code: 'ENOSPC',
      syscall: 'write',
    });
    const syscallOnlyError = Object.assign(new Error('EACCES'), {
      syscall: 'open',
    });

    expect(translateUploadError(diskError)).toBe(diskError);
    expect(translateUploadError(syscallOnlyError)).toBe(syscallOnlyError);
  });

  it('passes non-Error values through unchanged', () => {
    const rawValue = { reason: 'unknown' };

    expect(translateUploadError(rawValue)).toBe(rawValue);
    expect(translateUploadError('boom')).toBe('boom');
  });

  it('regression: unexpected field and file count produce distinct messages, none equal to the legacy generic message', () => {
    const unexpectedField = translateUploadError(
      new multer.MulterError('LIMIT_UNEXPECTED_FILE', 'image'),
    ) as HttpError;
    const fileCount = translateUploadError(
      new multer.MulterError('LIMIT_FILE_COUNT'),
    ) as HttpError;

    expect(unexpectedField.message).not.toBe(fileCount.message);
    expect(unexpectedField.message).not.toBe(LEGACY_GENERIC_MESSAGE);
    expect(fileCount.message).not.toBe(LEGACY_GENERIC_MESSAGE);
  });
});
