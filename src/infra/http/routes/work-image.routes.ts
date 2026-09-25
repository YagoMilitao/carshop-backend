import {
  Router,
  type NextFunction,
  type Request,
  type RequestHandler,
  type Response,
  type Router as ExpressRouter,
} from 'express';
import multer from 'multer';
import type { WorkRepositoryPort } from '../../../core/domain/repositories/work.repository';
import type { ImageStoragePort } from '../../../core/domain/application/Storage/image-storage.port';
import type { SessionStorePort } from '../../../core/domain/repositories/session-store.repository';
import type { TokenServicePort } from '../../../core/domain/application/Auth/token-service.port';
import { buildAuthMiddleware } from '../../presentation/middleware/auth.middleware';
import { HttpError } from '../../../core/domain/application/ApplicationError/http-error';

import { UploadWorkImageUseCase } from '../../../usecase/upload-work-image.use-case';
import { DeleteWorkImageUseCase } from '../../../usecase/delete-work-image.use-case';
import { WorkImageController } from '../../../presentation/controllers/work-image.controller';
import {
  UnsupportedImageTypeError,
  uploadMiddleware,
} from '../../middleware/upload.middleware';
import { imageContentValidationMiddleware } from '../../middleware/image-content-validation.middleware';

/**
 * Mensagens públicas e fixas do contrato de upload.
 *
 * Nunca ecoam `error.message`, `error.field` ou qualquer texto vindo do
 * Multer/busboy, para não expor detalhes internos (NFR-002).
 */
export const UPLOAD_ERROR_MESSAGES = {
  unsupportedType:
    'Tipo de arquivo não suportado. Envie JPEG/JPG, PNG ou WebP.',
  fileTooLarge: 'A imagem ultrapassa o limite de 5 MB.',
  unexpectedFileField:
    'Campo de arquivo inesperado. Envie a imagem no campo "file".',
  tooManyFiles: 'Envie apenas uma imagem por requisição.',
  fieldLimitsExceeded: 'Os campos do formulário excedem os limites permitidos.',
  malformedMultipart:
    'Corpo multipart malformado. Verifique o formato da requisição.',
} as const;

/**
 * Códigos do Multer relacionados a limites de campos de texto/partes.
 */
const FIELD_LIMIT_ERROR_CODES: ReadonlySet<string> = new Set([
  'LIMIT_FIELD_KEY',
  'LIMIT_FIELD_VALUE',
  'LIMIT_FIELD_COUNT',
  'LIMIT_PART_COUNT',
  'LIMIT_FIELD_NESTING',
  'LIMIT_FIELD_ARRAY_INDEX',
]);

/**
 * Identifica erros de sistema do Node.js (ex.: falha de escrita em disco
 * em `tmp/uploads`), que representam falha do servidor e não do cliente.
 */
function isSystemError(error: Error): boolean {
  const hasNumericErrno = 'errno' in error && typeof error.errno === 'number';
  const hasStringSyscall =
    'syscall' in error && typeof error.syscall === 'string';

  return hasNumericErrno || hasStringSyscall;
}

function translateMulterError(error: multer.MulterError): HttpError {
  if (error.code === 'LIMIT_FILE_SIZE') {
    return new HttpError(413, UPLOAD_ERROR_MESSAGES.fileTooLarge);
  }

  if (error.code === 'LIMIT_UNEXPECTED_FILE') {
    return new HttpError(400, UPLOAD_ERROR_MESSAGES.unexpectedFileField);
  }

  if (error.code === 'LIMIT_FILE_COUNT') {
    return new HttpError(400, UPLOAD_ERROR_MESSAGES.tooManyFiles);
  }

  if (FIELD_LIMIT_ERROR_CODES.has(error.code)) {
    return new HttpError(400, UPLOAD_ERROR_MESSAGES.fieldLimitsExceeded);
  }

  return new HttpError(400, UPLOAD_ERROR_MESSAGES.malformedMultipart);
}

/**
 * Traduz erros produzidos pelo Multer/busboy para o contrato HTTP
 * documentado no Swagger.
 *
 * Motivo:
 * manter o conhecimento específico do Multer isolado na camada de
 * infraestrutura/rotas, sem vazar para o error handler genérico
 * (`error-handler.middleware.ts`), e devolver mensagens específicas por
 * categoria de falha em vez de uma mensagem genérica única.
 *
 * Erros de sistema (disco) e valores que não são `Error` seguem inalterados
 * para o error handler central (500).
 */
export function translateUploadError(error: unknown): unknown {
  if (error instanceof HttpError) {
    return error;
  }

  if (error instanceof UnsupportedImageTypeError) {
    return new HttpError(415, UPLOAD_ERROR_MESSAGES.unsupportedType);
  }

  if (error instanceof multer.MulterError) {
    return translateMulterError(error);
  }

  if (error instanceof Error) {
    if (isSystemError(error)) {
      return error;
    }

    return new HttpError(400, UPLOAD_ERROR_MESSAGES.malformedMultipart);
  }

  return error;
}

/**
 * Envolve o middleware do Multer para traduzir apenas os erros que ele
 * produz.
 *
 * Motivo:
 * um error handler de rota (4 argumentos) também interceptaria erros do
 * `authMiddleware` e da validação de conteúdo; com o wrapper, apenas
 * falhas do parsing multipart são traduzidas.
 */
export function withUploadErrorTranslation(
  handler: RequestHandler,
): RequestHandler {
  return (request: Request, response: Response, next: NextFunction): void => {
    void handler(request, response, (error?: unknown) => {
      if (error) {
        next(translateUploadError(error));
        return;
      }

      next();
    });
  };
}

/**
 * Rotas administrativas de imagens dos works.
 */
export function buildWorkImageRouter(
  workRepository: WorkRepositoryPort,
  imageStorage: ImageStoragePort,
  sessionStore: SessionStorePort,
  tokenService: TokenServicePort,
): ExpressRouter {
  const router = Router();

  const authMiddleware = buildAuthMiddleware(sessionStore, tokenService);

  const uploadWorkImageUseCase = new UploadWorkImageUseCase(
    workRepository,
    imageStorage,
  );
  const deleteWorkImageUseCase = new DeleteWorkImageUseCase(
    workRepository,
    imageStorage,
  );

  const controller = new WorkImageController(
    uploadWorkImageUseCase,
    deleteWorkImageUseCase,
  );

  router.post(
    '/:workId/images',
    authMiddleware,
    withUploadErrorTranslation(uploadMiddleware.single('file')),
    imageContentValidationMiddleware,
    controller.upload,
  );

  router.delete('/:workId/images/:imageId', authMiddleware, controller.delete);

  return router;
}
