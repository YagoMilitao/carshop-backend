import multer from 'multer';

/**
 * Upload temporário em disco.
 *
 * Motivo:
 * o Cloudinary recebe o caminho local do arquivo.
 * Depois podemos apagar esse arquivo temporário.
 */
export const uploadMiddleware = multer({
  dest: 'tmp/uploads',

  limits: {
    fileSize: 5 * 1024 * 1024,
  },

  fileFilter: (_request, file, callback) => {
    const allowedMimeTypes = ['image/jpeg', 'image/png', 'image/webp'];

    if (!allowedMimeTypes.includes(file.mimetype)) {
      callback(new Error('Formato de imagem inválido.'));
      return;
    }

    callback(null, true);
  },
});
