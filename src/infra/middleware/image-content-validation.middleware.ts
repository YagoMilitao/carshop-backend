import { promises as fs } from 'node:fs';
import type { RequestHandler } from 'express';
import { HttpError } from '../../core/domain/application/ApplicationError/http-error';
import type { ALLOWED_IMAGE_MIME_TYPES } from './upload.middleware';

type AllowedImageMimeType = (typeof ALLOWED_IMAGE_MIME_TYPES)[number];

const JPEG_SOI = [0xff, 0xd8];
const JPEG_MARKER_PREFIX = 0xff;
const JPEG_TEM_MARKER = 0x01;
const JPEG_EOI_MARKER = 0xd9;
const JPEG_SOS_MARKER = 0xda;
const JPEG_DNL_MARKER = 0xdc;

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const PNG_CHUNK_OVERHEAD = 12;
const PNG_MAX_CHUNK_LENGTH = 0x7fffffff;
const PNG_CRC_POLYNOMIAL = 0xedb88320;

const PNG_CRC_TABLE = Array.from({ length: 256 }, (_, value) => {
  let crc = value;

  for (let bit = 0; bit < 8; bit += 1) {
    crc = (crc >>> 1) ^ (crc & 1 ? PNG_CRC_POLYNOMIAL : 0);
  }

  return crc >>> 0;
});

const PNG_VALID_BIT_DEPTHS_BY_COLOR_TYPE = new Map<number, number[]>([
  [0, [1, 2, 4, 8, 16]],
  [2, [8, 16]],
  [3, [1, 2, 4, 8]],
  [4, [8, 16]],
  [6, [8, 16]],
]);

const WEBP_IMAGE_CHUNK_TYPES = new Set(['VP8 ', 'VP8L']);
const WEBP_STRUCTURAL_CHUNK_TYPES = new Set([
  'VP8 ',
  'VP8L',
  'VP8X',
  'ALPH',
  'ANIM',
  'ANMF',
  'ICCP',
]);

interface WebpChunk {
  type: string;
  size: number;
  dataOffset: number;
  payloadEnd: number;
  end: number;
}

interface WebpExtendedHeader {
  isAnimated: boolean;
  canvasWidth: number;
  canvasHeight: number;
}

/**
 * Confere se `buffer` inicia com `bytes` na posição `offset`.
 */
function startsWith(buffer: Buffer, bytes: number[], offset = 0): boolean {
  if (buffer.length < offset + bytes.length) {
    return false;
  }

  return bytes.every((byte, index) => buffer[offset + index] === byte);
}

function isJpegStartOfFrameMarker(marker: number): boolean {
  return (
    marker >= 0xc0 &&
    marker <= 0xcf &&
    marker !== 0xc4 &&
    marker !== 0xc8 &&
    marker !== 0xcc
  );
}

function isJpegRestartMarker(marker: number): boolean {
  return marker >= 0xd0 && marker <= 0xd7;
}

/**
 * Valida os campos que determinam o tamanho dos cabeçalhos SOF e SOS.
 * Isso não decodifica pixels, mas impede que um marcador aparentemente
 * completo esconda um cabeçalho de imagem truncado ou inconsistente.
 */
function hasValidJpegSegmentHeader(
  buffer: Buffer,
  marker: number,
  segmentOffset: number,
  segmentLength: number,
): boolean {
  if (isJpegStartOfFrameMarker(marker)) {
    if (segmentLength < 11) {
      return false;
    }

    const componentCount = buffer[segmentOffset + 7];

    return componentCount > 0 && segmentLength === 8 + 3 * componentCount;
  }

  if (marker === JPEG_SOS_MARKER) {
    if (segmentLength < 8) {
      return false;
    }

    const componentCount = buffer[segmentOffset + 2];

    return componentCount > 0 && segmentLength === 6 + 2 * componentCount;
  }

  if (marker === JPEG_DNL_MARKER) {
    return segmentLength === 4;
  }

  return true;
}

function isValidJpeg(buffer: Buffer): boolean {
  if (!startsWith(buffer, JPEG_SOI)) {
    return false;
  }

  let offset = JPEG_SOI.length;
  let isInsideScan = false;
  let hasStartOfFrame = false;
  let hasStartOfScan = false;

  while (offset < buffer.length) {
    if (isInsideScan) {
      while (offset < buffer.length && buffer[offset] !== JPEG_MARKER_PREFIX) {
        offset += 1;
      }
    }

    if (offset >= buffer.length || buffer[offset] !== JPEG_MARKER_PREFIX) {
      return false;
    }

    // JPEG permite bytes FF de preenchimento antes do código do marcador.
    while (offset < buffer.length && buffer[offset] === JPEG_MARKER_PREFIX) {
      offset += 1;
    }

    if (offset >= buffer.length) {
      return false;
    }

    const marker = buffer[offset];
    const markerWasInsideScan = isInsideScan;
    offset += 1;

    // FF 00 representa um byte FF literal nos dados comprimidos.
    if (marker === 0x00) {
      if (!markerWasInsideScan) {
        return false;
      }

      continue;
    }

    // TEM e RST0-RST7 não têm campo de tamanho e mantêm o fluxo no scan.
    if (marker === JPEG_TEM_MARKER || isJpegRestartMarker(marker)) {
      if (!markerWasInsideScan) {
        return false;
      }

      continue;
    }

    isInsideScan = false;

    if (marker === JPEG_EOI_MARKER) {
      return hasStartOfFrame && hasStartOfScan && offset === buffer.length;
    }

    // SOI repetido e códigos reservados não formam segmentos JPEG válidos.
    if (
      marker === 0xd8 ||
      marker < 0xc0 ||
      (marker === JPEG_DNL_MARKER && !markerWasInsideScan)
    ) {
      return false;
    }

    if (offset + 2 > buffer.length) {
      return false;
    }

    const segmentLength = buffer.readUInt16BE(offset);

    if (segmentLength < 2) {
      return false;
    }

    const segmentEnd = offset + segmentLength;

    if (
      segmentEnd > buffer.length ||
      !hasValidJpegSegmentHeader(buffer, marker, offset, segmentLength)
    ) {
      return false;
    }

    if (isJpegStartOfFrameMarker(marker)) {
      hasStartOfFrame = true;
    }

    if (marker === JPEG_SOS_MARKER) {
      if (!hasStartOfFrame) {
        return false;
      }

      hasStartOfScan = true;
      isInsideScan = true;
    } else if (markerWasInsideScan && marker === JPEG_DNL_MARKER) {
      // DNL pode aparecer dentro dos dados comprimidos e o scan continua
      // imediatamente depois do seu segmento de tamanho fixo.
      isInsideScan = true;
    }

    offset = segmentEnd;
  }

  return false;
}

function calculatePngCrc(buffer: Buffer, start: number, end: number): number {
  let crc = 0xffffffff;

  for (let offset = start; offset < end; offset += 1) {
    crc = PNG_CRC_TABLE[(crc ^ buffer[offset]) & 0xff] ^ (crc >>> 8);
  }

  return (crc ^ 0xffffffff) >>> 0;
}

function isPngChunkTypeByte(byte: number): boolean {
  return (byte >= 0x41 && byte <= 0x5a) || (byte >= 0x61 && byte <= 0x7a);
}

function hasValidPngHeader(buffer: Buffer, dataOffset: number): boolean {
  const width = buffer.readUInt32BE(dataOffset);
  const height = buffer.readUInt32BE(dataOffset + 4);
  const bitDepth = buffer[dataOffset + 8];
  const colorType = buffer[dataOffset + 9];
  const compressionMethod = buffer[dataOffset + 10];
  const filterMethod = buffer[dataOffset + 11];
  const interlaceMethod = buffer[dataOffset + 12];

  return (
    width > 0 &&
    height > 0 &&
    PNG_VALID_BIT_DEPTHS_BY_COLOR_TYPE.get(colorType)?.includes(bitDepth) ===
      true &&
    compressionMethod === 0 &&
    filterMethod === 0 &&
    (interlaceMethod === 0 || interlaceMethod === 1)
  );
}

function isValidPng(buffer: Buffer): boolean {
  if (!startsWith(buffer, PNG_SIGNATURE)) {
    return false;
  }

  let offset = PNG_SIGNATURE.length;
  let chunkIndex = 0;
  let colorType: number | null = null;
  let bitDepth: number | null = null;
  let hasPalette = false;
  let hasImageData = false;
  let imageDataEnded = false;

  while (offset < buffer.length) {
    if (offset + PNG_CHUNK_OVERHEAD > buffer.length) {
      return false;
    }

    const chunkLength = buffer.readUInt32BE(offset);

    if (chunkLength > PNG_MAX_CHUNK_LENGTH) {
      return false;
    }

    const typeOffset = offset + 4;
    const dataOffset = typeOffset + 4;
    const crcOffset = dataOffset + chunkLength;
    const chunkEnd = crcOffset + 4;

    if (chunkEnd > buffer.length) {
      return false;
    }

    const typeBytes = buffer.subarray(typeOffset, dataOffset);

    if (
      !Array.from(typeBytes).every(isPngChunkTypeByte) ||
      (typeBytes[2] & 0x20) !== 0
    ) {
      return false;
    }

    const expectedCrc = buffer.readUInt32BE(crcOffset);

    if (calculatePngCrc(buffer, typeOffset, crcOffset) !== expectedCrc) {
      return false;
    }

    const chunkType = typeBytes.toString('ascii');

    if (chunkIndex === 0 && chunkType !== 'IHDR') {
      return false;
    }

    if (chunkType === 'IHDR') {
      if (
        chunkIndex !== 0 ||
        chunkLength !== 13 ||
        !hasValidPngHeader(buffer, dataOffset)
      ) {
        return false;
      }

      bitDepth = buffer[dataOffset + 8];
      colorType = buffer[dataOffset + 9];
    } else if (chunkType === 'PLTE') {
      if (
        hasPalette ||
        hasImageData ||
        colorType === 0 ||
        colorType === 4 ||
        chunkLength === 0 ||
        chunkLength > 768 ||
        chunkLength % 3 !== 0 ||
        (colorType === 3 &&
          bitDepth !== null &&
          chunkLength / 3 > 2 ** bitDepth)
      ) {
        return false;
      }

      hasPalette = true;
    } else if (chunkType === 'IDAT') {
      if (imageDataEnded || (colorType === 3 && !hasPalette)) {
        return false;
      }

      hasImageData = true;
    } else {
      if (hasImageData) {
        imageDataEnded = true;
      }

      if (chunkType === 'IEND') {
        return chunkLength === 0 && hasImageData && chunkEnd === buffer.length;
      }

      // Tipos críticos desconhecidos não podem ser ignorados com segurança.
      if ((typeBytes[0] & 0x20) === 0) {
        return false;
      }
    }

    offset = chunkEnd;
    chunkIndex += 1;
  }

  return false;
}

function readWebpChunk(
  buffer: Buffer,
  offset: number,
  limit: number,
): WebpChunk | null {
  if (offset + 8 > limit) {
    return null;
  }

  const type = buffer.toString('ascii', offset, offset + 4);
  const size = buffer.readUInt32LE(offset + 4);
  const dataOffset = offset + 8;
  const payloadEnd = dataOffset + size;
  const end = payloadEnd + (size % 2);

  if (end > limit || (size % 2 === 1 && buffer[payloadEnd] !== 0)) {
    return null;
  }

  return { type, size, dataOffset, payloadEnd, end };
}

function hasValidVp8Payload(buffer: Buffer, chunk: WebpChunk): boolean {
  if (chunk.size < 10) {
    return false;
  }

  const frameTag = buffer.readUIntLE(chunk.dataOffset, 3);
  const firstPartitionLength = frameTag >>> 5;
  const width = buffer.readUInt16LE(chunk.dataOffset + 6) & 0x3fff;
  const height = buffer.readUInt16LE(chunk.dataOffset + 8) & 0x3fff;

  return (
    (frameTag & 0x01) === 0 &&
    (frameTag & 0x10) !== 0 &&
    startsWith(buffer, [0x9d, 0x01, 0x2a], chunk.dataOffset + 3) &&
    width > 0 &&
    height > 0 &&
    firstPartitionLength <= chunk.size - 10
  );
}

function hasValidVp8lPayload(buffer: Buffer, chunk: WebpChunk): boolean {
  if (chunk.size < 6 || buffer[chunk.dataOffset] !== 0x2f) {
    return false;
  }

  const imageHeader = buffer.readUInt32LE(chunk.dataOffset + 1);
  const version = imageHeader >>> 29;

  return version === 0;
}

function hasValidWebpImagePayload(buffer: Buffer, chunk: WebpChunk): boolean {
  if (chunk.type === 'VP8 ') {
    return hasValidVp8Payload(buffer, chunk);
  }

  if (chunk.type === 'VP8L') {
    return hasValidVp8lPayload(buffer, chunk);
  }

  return false;
}

function readWebpExtendedHeader(
  buffer: Buffer,
  chunk: WebpChunk,
): WebpExtendedHeader | null {
  if (chunk.size !== 10) {
    return null;
  }

  const flags = buffer[chunk.dataOffset];
  const hasReservedFlag = (flags & 0xc1) !== 0;
  const hasReservedBytes =
    buffer[chunk.dataOffset + 1] !== 0 ||
    buffer[chunk.dataOffset + 2] !== 0 ||
    buffer[chunk.dataOffset + 3] !== 0;
  const canvasWidth = buffer.readUIntLE(chunk.dataOffset + 4, 3) + 1;
  const canvasHeight = buffer.readUIntLE(chunk.dataOffset + 7, 3) + 1;

  if (
    hasReservedFlag ||
    hasReservedBytes ||
    canvasWidth * canvasHeight > 0xffffffff
  ) {
    return null;
  }

  return {
    isAnimated: (flags & 0x02) !== 0,
    canvasWidth,
    canvasHeight,
  };
}

function hasValidWebpAlphaPayload(buffer: Buffer, chunk: WebpChunk): boolean {
  if (chunk.size < 2) {
    return false;
  }

  const header = buffer[chunk.dataOffset];

  return (
    (header & 0xc0) === 0 && (header & 0x20) === 0 && (header & 0x02) === 0
  );
}

function hasValidWebpAnimationFrame(
  buffer: Buffer,
  chunk: WebpChunk,
  extendedHeader: WebpExtendedHeader,
): boolean {
  if (chunk.size < 16) {
    return false;
  }

  const frameX = buffer.readUIntLE(chunk.dataOffset, 3) * 2;
  const frameY = buffer.readUIntLE(chunk.dataOffset + 3, 3) * 2;
  const frameWidth = buffer.readUIntLE(chunk.dataOffset + 6, 3) + 1;
  const frameHeight = buffer.readUIntLE(chunk.dataOffset + 9, 3) + 1;
  const frameFlags = buffer[chunk.dataOffset + 15];

  if (
    (frameFlags & 0xfc) !== 0 ||
    frameX + frameWidth > extendedHeader.canvasWidth ||
    frameY + frameHeight > extendedHeader.canvasHeight
  ) {
    return false;
  }

  let offset = chunk.dataOffset + 16;
  let hasAlpha = false;
  let hasBitstream = false;

  while (offset < chunk.payloadEnd) {
    const subchunk = readWebpChunk(buffer, offset, chunk.payloadEnd);

    if (!subchunk) {
      return false;
    }

    if (subchunk.type === 'ALPH') {
      if (
        hasAlpha ||
        hasBitstream ||
        !hasValidWebpAlphaPayload(buffer, subchunk)
      ) {
        return false;
      }

      hasAlpha = true;
    } else if (WEBP_IMAGE_CHUNK_TYPES.has(subchunk.type)) {
      if (
        hasBitstream ||
        (hasAlpha && subchunk.type === 'VP8L') ||
        !hasValidWebpImagePayload(buffer, subchunk)
      ) {
        return false;
      }

      hasBitstream = true;
    } else if (!hasBitstream) {
      // Subchunks desconhecidos só são permitidos depois do bitstream.
      return false;
    }

    offset = subchunk.end;
  }

  return hasBitstream && offset === chunk.payloadEnd;
}

function isValidWebp(buffer: Buffer): boolean {
  if (buffer.length < 20) {
    return false;
  }

  const isRiff = buffer.toString('ascii', 0, 4) === 'RIFF';
  const isWebp = buffer.toString('ascii', 8, 12) === 'WEBP';
  const riffSize = buffer.readUInt32LE(4);

  if (!isRiff || !isWebp || riffSize + 8 !== buffer.length) {
    return false;
  }

  let offset = 12;
  let isFirstChunk = true;
  let isSimpleFormat = false;
  let extendedHeader: WebpExtendedHeader | null = null;
  let hasAlpha = false;
  let hasImage = false;
  let hasAnimationControl = false;
  let hasAnimationFrame = false;

  while (offset < buffer.length) {
    const chunk = readWebpChunk(buffer, offset, buffer.length);

    if (!chunk) {
      return false;
    }

    if (isFirstChunk) {
      if (WEBP_IMAGE_CHUNK_TYPES.has(chunk.type)) {
        if (!hasValidWebpImagePayload(buffer, chunk)) {
          return false;
        }

        isSimpleFormat = true;
        hasImage = true;
      } else if (chunk.type === 'VP8X') {
        extendedHeader = readWebpExtendedHeader(buffer, chunk);

        if (!extendedHeader) {
          return false;
        }
      } else {
        return false;
      }

      isFirstChunk = false;
      offset = chunk.end;
      continue;
    }

    if (isSimpleFormat) {
      if (WEBP_STRUCTURAL_CHUNK_TYPES.has(chunk.type)) {
        return false;
      }

      offset = chunk.end;
      continue;
    }

    if (!extendedHeader || chunk.type === 'VP8X') {
      return false;
    }

    if (chunk.type === 'ICCP') {
      if (hasImage || hasAnimationControl || chunk.size === 0) {
        return false;
      }
    } else if (chunk.type === 'ANIM') {
      if (
        !extendedHeader.isAnimated ||
        hasAnimationControl ||
        hasAnimationFrame ||
        chunk.size !== 6
      ) {
        return false;
      }

      hasAnimationControl = true;
    } else if (chunk.type === 'ANMF') {
      if (
        !extendedHeader.isAnimated ||
        !hasAnimationControl ||
        !hasValidWebpAnimationFrame(buffer, chunk, extendedHeader)
      ) {
        return false;
      }

      hasAnimationFrame = true;
    } else if (chunk.type === 'ALPH') {
      if (
        extendedHeader.isAnimated ||
        hasAlpha ||
        hasImage ||
        !hasValidWebpAlphaPayload(buffer, chunk)
      ) {
        return false;
      }

      hasAlpha = true;
    } else if (WEBP_IMAGE_CHUNK_TYPES.has(chunk.type)) {
      if (
        extendedHeader.isAnimated ||
        hasImage ||
        (hasAlpha && chunk.type === 'VP8L') ||
        !hasValidWebpImagePayload(buffer, chunk)
      ) {
        return false;
      }

      hasImage = true;
    }

    offset = chunk.end;
  }

  return extendedHeader?.isAnimated
    ? hasAnimationControl && hasAnimationFrame
    : hasImage;
}

/**
 * Inspeciona a assinatura e a estrutura interna do conteúdo binário real de
 * `buffer` para determinar se ele corresponde a um dos formatos permitidos.
 *
 * Importante: esta verificação confirma a estrutura/framing do arquivo
 * (incluindo segmentos JPEG, chunks/CRCs PNG e chunks/payloads WebP), não a
 * decodificação completa do codec. Um arquivo pode satisfazer essas checagens
 * e ainda assim não ser decodificável por um decodificador de imagem completo
 * — esse nível de verificação está fora do escopo desta tarefa (ver spec
 * CARSHOP-109, seção "Out of Scope").
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
    await bestEffortUnlink(filePath);
    next(error);
  }
};
