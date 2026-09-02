import { promises as fs } from 'node:fs';
import type { RequestHandler } from 'express';
import { HttpError } from '../../core/domain/application/ApplicationError/http-error';
import type { ALLOWED_IMAGE_MIME_TYPES } from './upload.middleware';

type AllowedImageMimeType = (typeof ALLOWED_IMAGE_MIME_TYPES)[number];

const JPEG_SOI = [0xff, 0xd8, 0xff];
const JPEG_EOI = [0xff, 0xd9];

const PNG_SIGNATURE = [
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
];
const PNG_IEND_FOOTER = [
  0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82,
];

const WEBP_VALID_FOURCCS = new Set(['VP8 ', 'VP8L', 'VP8X']);

/**
 * Confere se `buffer` inicia com `bytes` na posição `offset`.
 */
function startsWith(buffer: Buffer, bytes: number[], offset = 0): boolean {
  if (buffer.length < offset + bytes.length) {
    return false;
  }

  return bytes.every((byte, index) => buffer[offset + index] === byte);
}

/**
 * Confere se `buffer` termina com `bytes`.
 */
function endsWith(buffer: Buffer, bytes: number[]): boolean {
  if (buffer.length < bytes.length) {
    return false;
  }

  const offset = buffer.length - bytes.length;

  return bytes.every((byte, index) => buffer[offset + index] === byte);
}

function isValidJpeg(buffer: Buffer): boolean {
  return startsWith(buffer, JPEG_SOI) && endsWith(buffer, JPEG_EOI);
}

function isValidPng(buffer: Buffer): boolean {
  return (
    startsWith(buffer, PNG_SIGNATURE) && endsWith(buffer, PNG_IEND_FOOTER)
  );
}

function isValidWebp(buffer: Buffer): boolean {
  if (buffer.length < 16) {
    return false;
  }

  const isRiff = buffer.toString('ascii', 0, 4) === 'RIFF';
  const isWebp = buffer.toString('ascii', 8, 12) === 'WEBP';
  const fourCc = buffer.toString('ascii', 12, 16);

  if (!isRiff || !isWebp || !WEBP_VALID_FOURCCS.has(fourCc)) {
    return false;
  }

  const riffSize = buffer.readUInt32LE(4);

  /**
   * O tamanho declarado no cabeçalho RIFF cobre tudo após os 8 primeiros
   * bytes (assinatura + tamanho). Alguns encoders alinham blocos de
   * tamanho ímpar acrescentando 1 byte de padding ao final do arquivo,
   * por isso toleramos `riffSize + 8` ou `riffSize + 9`.
   */
  return riffSize + 8 === buffer.length || riffSize + 9 === buffer.length;
}

/**
 * Inspeciona o conteúdo binário real de `buffer` e determina, por
 * assinatura/estrutura (magic bytes + marcadores de fechamento), se ele
 * corresponde a um dos formatos de imagem permitidos.
 *
 * Importante: esta verificação confirma a estrutura/framing do arquivo
 * (cabeçalho e rodapé esperados para cada formato), não a decodificação
 * completa do codec. Um arquivo pode satisfazer essas checagens e ainda
 * assim não ser decodificável por um decodificador de imagem completo —
 * esse nível de verificação está fora do escopo desta tarefa (ver
 * spec CARSHOP-109, seção "Out of Scope").
 */
export function detectImageMimeType(
  buffer: Buffer,
): AllowedImageMimeType | null {
  if (isValidJpeg(buffer)) {
    return 'image/jpeg';
  }

  if (isValidPng(buffer)) {
    return 'image/png';
  }

  if (isValidWebp(buffer)) {
    return 'image/webp';
  }

  return null;
}

/**
 * Remove, em melhor esforço, o arquivo temporário do Multer.
 *
 * Motivo:
 * espelha o padrão já usado em `upload-work-image.use-case.ts`: a
 * limpeza nunca deve mascarar o erro de validação original.
 */
async function bestEffortUnlink(filePath: string): Promise<void> {
  try {
    await fs.unlink(filePath);
  } catch {
    // Melhor esforço: o arquivo já pode não existir.
  }
}

/**
 * Middleware que valida o conteúdo binário real do arquivo enviado,
 * rejeitando uploads cujo tipo declarado (`file.mimetype`) não
 * corresponda ao tipo detectado a partir dos bytes reais do arquivo
 * (CARSHOP-109, FR-001 a FR-004).
 *
 * Regra de coerência adotada: qualquer divergência entre o tipo
 * declarado e o tipo detectado é rejeitada, mesmo quando ambos são
 * individualmente permitidos (ver `specs/CARSHOP-109/plan.md`).
 */
export const imageContentValidationMiddleware: RequestHandler = async (
  request,
  _response,
  next,
) => {
  if (!request.file) {
    next();
    return;
  }

  const { path: filePath, mimetype } = request.file;

  try {
    const buffer = await fs.readFile(filePath);
    const detectedMimeType = detectImageMimeType(buffer);

    if (!detectedMimeType || detectedMimeType !== mimetype) {
      await bestEffortUnlink(filePath);
      next(
        new HttpError(
          415,
          'Tipo de arquivo não suportado. Envie JPEG, PNG ou WebP.',
        ),
      );
      return;
    }

    next();
  } catch (error: unknown) {
    next(error);
  }
};
