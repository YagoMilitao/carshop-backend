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
const mockSingle = jest.fn(() => 'upload-middleware-handler');
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

import { buildWorkImageRouter } from '../../../../../src/infra/http/routes/work-image.routes';

describe('buildWorkImageRouter', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  function buildRouterAndCaptureUploadMiddlewares() {
    const workRepository = { name: 'work-repository' } as never;
    const imageStorage = { name: 'image-storage' } as never;
    const sessionStore = { name: 'session-store' } as never;
    const tokenService = { name: 'token-service' } as never;

    const router = buildWorkImageRouter(
      workRepository,
      imageStorage,
      sessionStore,
      tokenService,
    );

    return { router };
  }

  it('registers the upload and delete routes behind authMiddleware (AC-009)', () => {
    const { router } = buildRouterAndCaptureUploadMiddlewares();

    expect(router).toBe(mockRouterInstance);
    expect(mockBuildAuthMiddleware).toHaveBeenCalled();
    expect(mockSingle).toHaveBeenCalledWith('file');

    expect(mockPost).toHaveBeenCalledWith(
      '/:workId/images',
      'auth-middleware',
      'upload-middleware-handler',
      'image-content-validation-handler',
      expect.any(Function),
      'upload-handler',
    );

    expect(mockDelete).toHaveBeenCalledWith(
      '/:workId/images/:imageId',
      'auth-middleware',
      'delete-handler',
    );
  });

  function getNormalizeUploadError(): (
    error: unknown,
    request: unknown,
    response: unknown,
    next: jest.Mock,
  ) => void {
    buildRouterAndCaptureUploadMiddlewares();
    const uploadCallArgs = mockPost.mock.calls.find(
      (call) => call[0] === '/:workId/images',
    );
    if (!uploadCallArgs) {
      throw new Error('upload route was not registered');
    }
    return uploadCallArgs[4];
  }

  it('maps Multer LIMIT_FILE_SIZE errors to HttpError 413 (AC-007, FR-009)', () => {
    const normalizeUploadError = getNormalizeUploadError();
    const next = jest.fn();
    const multerError = new multer.MulterError('LIMIT_FILE_SIZE');

    normalizeUploadError(multerError, {}, {}, next);

    expect(next).toHaveBeenCalledWith(expect.any(HttpError));
    const forwardedError = next.mock.calls[0][0] as HttpError;
    expect(forwardedError.statusCode).toBe(413);
  });

  it('maps other Multer errors to HttpError 400', () => {
    const normalizeUploadError = getNormalizeUploadError();
    const next = jest.fn();
    const multerError = new multer.MulterError('LIMIT_UNEXPECTED_FILE');

    normalizeUploadError(multerError, {}, {}, next);

    expect(next).toHaveBeenCalledWith(expect.any(HttpError));
    const forwardedError = next.mock.calls[0][0] as HttpError;
    expect(forwardedError.statusCode).toBe(400);
  });

  it('maps custom fileFilter errors (invalid mime type) to HttpError 415 (AC-006, FR-008)', () => {
    const normalizeUploadError = getNormalizeUploadError();
    const next = jest.fn();
    const fileFilterError = new Error('Tipo de arquivo não suportado.');

    normalizeUploadError(fileFilterError, {}, {}, next);

    expect(next).toHaveBeenCalledWith(expect.any(HttpError));
    const forwardedError = next.mock.calls[0][0] as HttpError;
    expect(forwardedError.statusCode).toBe(415);
  });

  it('passes through an existing HttpError (e.g. 401 from authMiddleware) without rewriting it to 415', () => {
    const normalizeUploadError = getNormalizeUploadError();
    const next = jest.fn();
    const authError = new HttpError(401, 'Token inválido ou ausente.');

    normalizeUploadError(authError, {}, {}, next);

    expect(next).toHaveBeenCalledWith(authError);
    const forwardedError = next.mock.calls[0][0] as HttpError;
    expect(forwardedError.statusCode).toBe(401);
  });

  it('calls next() with no error when there is no upload error', () => {
    const normalizeUploadError = getNormalizeUploadError();
    const next = jest.fn();

    normalizeUploadError(undefined, {}, {}, next);

    expect(next).toHaveBeenCalledWith();
  });
});
