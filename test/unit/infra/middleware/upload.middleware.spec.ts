import express, {
  type ErrorRequestHandler,
  type RequestHandler,
} from 'express';
import multer from 'multer';
import request from 'supertest';

import {
  ALLOWED_IMAGE_MIME_TYPES,
  isAllowedImageMimeType,
  MAX_IMAGE_SIZE_BYTES,
  uploadMiddleware,
} from '../../../../src/infra/middleware/upload.middleware';

/**
 * Cria uma aplicação Express mínima para testar somente
 * o comportamento do middleware de upload.
 */
function createTestApp() {
  const app = express();

  /**
   * Endpoint temporário usado exclusivamente nos testes.
   *
   * O nome `file` precisa ser igual ao usado na rota real:
   * uploadMiddleware.single('file').
   */
  const uploadHandler: RequestHandler = (request, response) => {
    response.status(200).json({
      hasFile: Boolean(request.file),
      mimeType: request.file?.mimetype,
      originalName: request.file?.originalname,
    });
  };

  app.post('/upload', uploadMiddleware.single('file'), uploadHandler);

  /**
   * Middleware de erros específico dos testes.
   *
   * Ele transforma erros do Multer em respostas HTTP previsíveis,
   * permitindo validar código e mensagem.
   */
  const errorHandler: ErrorRequestHandler = (
    error,
    _request,
    response,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _next,
  ) => {
    if (error instanceof multer.MulterError) {
      response.status(400).json({
        code: error.code,
        message: error.message,
      });

      return;
    }

    if (error instanceof Error) {
      response.status(400).json({
        message: error.message,
      });

      return;
    }

    response.status(500).json({
      message: 'Erro desconhecido.',
    });
  };

  app.use(errorHandler);

  return app;
}

describe('isAllowedImageMimeType', () => {
  it.each(['image/jpeg', 'image/png', 'image/webp'])(
    'deve aceitar o MIME type %s',
    (mimeType) => {
      expect(isAllowedImageMimeType(mimeType)).toBe(true);
    },
  );

  it.each([
    'application/pdf',
    'text/plain',
    'image/gif',
    'image/svg+xml',
    'application/octet-stream',
  ])('deve rejeitar o MIME type %s', (mimeType) => {
    expect(isAllowedImageMimeType(mimeType)).toBe(false);
  });

  it('deve possuir exatamente os formatos permitidos', () => {
    expect(ALLOWED_IMAGE_MIME_TYPES).toEqual([
      'image/jpeg',
      'image/png',
      'image/webp',
    ]);
  });

  it('deve configurar o limite máximo como 5 MB', () => {
    expect(MAX_IMAGE_SIZE_BYTES).toBe(5 * 1024 * 1024);
  });
});

describe('uploadMiddleware', () => {
  const app = createTestApp();

  it('deve aceitar uma imagem JPEG válida', async () => {
    const response = await request(app)
      .post('/upload')
      .attach('file', Buffer.from('conteudo-jpeg-de-teste'), {
        filename: 'imagem.jpg',
        contentType: 'image/jpeg',
      });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      hasFile: true,
      mimeType: 'image/jpeg',
      originalName: 'imagem.jpg',
    });
  });

  it('deve aceitar uma imagem PNG válida', async () => {
    const response = await request(app)
      .post('/upload')
      .attach('file', Buffer.from('conteudo-png-de-teste'), {
        filename: 'imagem.png',
        contentType: 'image/png',
      });

    expect(response.status).toBe(200);
    expect(response.body.mimeType).toBe('image/png');
  });

  it('deve aceitar uma imagem WebP válida', async () => {
    const response = await request(app)
      .post('/upload')
      .attach('file', Buffer.from('conteudo-webp-de-teste'), {
        filename: 'imagem.webp',
        contentType: 'image/webp',
      });

    expect(response.status).toBe(200);
    expect(response.body.mimeType).toBe('image/webp');
  });

  it('deve rejeitar arquivo PDF', async () => {
    const response = await request(app)
      .post('/upload')
      .attach('file', Buffer.from('conteudo-pdf-de-teste'), {
        filename: 'documento.pdf',
        contentType: 'application/pdf',
      });

    expect(response.status).toBe(400);
    expect(response.body).toEqual({
      message: 'Formato inválido. Envie uma imagem JPEG, PNG ou WebP.',
    });
  });

  it('deve rejeitar imagem GIF', async () => {
    const response = await request(app)
      .post('/upload')
      .attach('file', Buffer.from('conteudo-gif-de-teste'), {
        filename: 'imagem.gif',
        contentType: 'image/gif',
      });

    expect(response.status).toBe(400);
    expect(response.body.message).toContain('Formato inválido');
  });

  it('deve rejeitar arquivo maior que 5 MB', async () => {
    /**
     * Criamos um buffer com um byte a mais que o limite.
     *
     * Não precisa ser uma imagem real, pois neste teste queremos
     * validar especificamente o limite de tamanho do Multer.
     */
    const oversizedBuffer = Buffer.alloc(MAX_IMAGE_SIZE_BYTES + 1, 1);

    const response = await request(app)
      .post('/upload')
      .attach('file', oversizedBuffer, {
        filename: 'imagem-grande.jpg',
        contentType: 'image/jpeg',
      });

    expect(response.status).toBe(400);
    expect(response.body.code).toBe('LIMIT_FILE_SIZE');
  });

  it('deve continuar a requisição quando nenhum arquivo for enviado', async () => {
    /**
     * O Multer não considera ausência de arquivo como erro.
     *
     * A responsabilidade de exigir a imagem continua sendo
     * do WorkImageController, que verifica `request.file`.
     */
    const response = await request(app).post('/upload');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      hasFile: false,
    });
  });

  it('deve rejeitar um nome de campo diferente de file', async () => {
    const response = await request(app)
      .post('/upload')
      .attach('images', Buffer.from('conteudo-de-teste'), {
        filename: 'imagem.jpg',
        contentType: 'image/jpeg',
      });

    expect(response.status).toBe(400);
    expect(response.body.code).toBe('LIMIT_UNEXPECTED_FILE');
  });
});
