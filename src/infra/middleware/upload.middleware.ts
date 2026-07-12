import multer from 'multer';

/**
 * Tamanho máximo permitido para cada imagem: 5 MB.
 *
 * Exportamos a constante para evitar números mágicos
 * e permitir que os testes confirmem a configuração.
 */
export const MAX_IMAGE_SIZE_BYTES = 5 * 1024 * 1024;

/**
 * Tipos MIME permitidos para upload.
 *
 * O `as const` mantém os valores literais fortemente tipados.
 */
export const ALLOWED_IMAGE_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
] as const;

/**
 * Verifica se o tipo MIME informado é aceito pela aplicação.
 *
 * Motivo:
 * manter a regra independente do Multer, facilitando testes unitários
 * e reutilização futura em outros fluxos.
 */
export function isAllowedImageMimeType(mimeType: string): boolean {
  return ALLOWED_IMAGE_MIME_TYPES.includes(
    mimeType as (typeof ALLOWED_IMAGE_MIME_TYPES)[number],
  );
}

/**
 * Middleware responsável por receber temporariamente uma imagem.
 *
 * O arquivo é salvo em `tmp/uploads` antes de ser enviado
 * ao serviço externo, como Cloudinary.
 */
export const uploadMiddleware = multer({
  dest: 'tmp/uploads',

  limits: {
    fileSize: MAX_IMAGE_SIZE_BYTES,
  },

  fileFilter: (_request, file, callback) => {
    if (!isAllowedImageMimeType(file.mimetype)) {
      callback(
        new Error('Formato inválido. Envie uma imagem JPEG, PNG ou WebP.'),
      );
      return;
    }
    callback(null, true);
  },
});
