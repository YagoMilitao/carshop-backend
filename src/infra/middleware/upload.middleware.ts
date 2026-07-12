import multer from 'multer';

/**
 * Middleware responsável por receber temporariamente
 * uma única imagem antes de enviá-la ao storage externo.
 */
export const uploadMiddleware = multer({
  dest: 'tmp/uploads',

  limits: {
    /**
     * Limite máximo de 5 MB.
     */
    fileSize: 5 * 1024 * 1024,
  },

  fileFilter: (_request, file, callback) => {
    /**
     * Tipos MIME permitidos.
     */
    const allowedMimeTypes = ['image/jpeg', 'image/png', 'image/webp'];

    if (!allowedMimeTypes.includes(file.mimetype)) {
      callback(
        new Error('Formato inválido. Envie uma imagem JPEG, PNG ou WebP.'),
      );
      return;
    }

    callback(null, true);
  },
});
