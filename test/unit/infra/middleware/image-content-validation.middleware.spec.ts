const mockReadFile = jest.fn();
const mockUnlink = jest.fn();

jest.mock('fs', () => ({
  promises: {
    readFile: (...args: unknown[]) =>
      (mockReadFile as unknown as (...a: unknown[]) => unknown)(...args),
    unlink: (...args: unknown[]) =>
      (mockUnlink as unknown as (...a: unknown[]) => unknown)(...args),
  },
}));

import {
  detectImageMimeType,
  imageContentValidationMiddleware,
} from '../../../../src/infra/middleware/image-content-validation.middleware';
import { HttpError } from '../../../../src/core/domain/application/ApplicationError/http-error';

const VALID_JPEG = Buffer.from([
  // SOI + SOF0 (1x1, one component)
  0xff, 0xd8, 0xff, 0xc0, 0x00, 0x0b, 0x08, 0x00, 0x01, 0x00, 0x01, 0x01, 0x01,
  0x11, 0x00,
  // SOS (one component)
  0xff, 0xda, 0x00, 0x08, 0x01, 0x01, 0x00, 0x00, 0x3f, 0x00,
  // Entropy data with a stuffed FF and a restart marker, then EOI
  0x2a, 0xff, 0x00, 0x2b, 0xff, 0xd0, 0x2c, 0xff, 0xd9,
]);

const TRUNCATED_JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);

const JPEG_WITH_TRUNCATED_APP0_SEGMENT = Buffer.from([
  0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0xff,
  0xd9,
]);

const PNG_WITHOUT_IHDR_OR_IDAT = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x00, 0x49,
  0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82,
]);

const VALID_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR4nGNgAAIAAAUAAXpeqz8AAAAASUVORK5CYII=',
  'base64',
);

const PNG_WITH_CORRUPTED_CRC = Buffer.from(VALID_PNG);
PNG_WITH_CORRUPTED_CRC[32] ^= 0xff;

const PNG_WITHOUT_IDAT = Buffer.concat([
  VALID_PNG.subarray(0, 33),
  VALID_PNG.subarray(56),
]);

const PNG_SIGNATURE = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
]);

function calculatePngCrc(buffer: Buffer): number {
  let crc = 0xffffffff;

  for (const byte of buffer) {
    crc ^= byte;

    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
  }

  return (crc ^ 0xffffffff) >>> 0;
}

function buildPngChunk(type: string, data: Buffer = Buffer.alloc(0)): Buffer {
  const typeBuffer = Buffer.from(type, 'ascii');
  const chunk = Buffer.alloc(12 + data.length);

  chunk.writeUInt32BE(data.length, 0);
  typeBuffer.copy(chunk, 4);
  data.copy(chunk, 8);
  chunk.writeUInt32BE(
    calculatePngCrc(Buffer.concat([typeBuffer, data])),
    8 + data.length,
  );

  return chunk;
}

function buildPngHeader(colorType = 6, bitDepth = 8): Buffer {
  const header = Buffer.alloc(13);

  header.writeUInt32BE(1, 0);
  header.writeUInt32BE(1, 4);
  header[8] = bitDepth;
  header[9] = colorType;

  return header;
}

function buildPng(...chunks: Buffer[]): Buffer {
  return Buffer.concat([PNG_SIGNATURE, ...chunks]);
}

const TRUNCATED_PNG = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
]);

const VALID_WEBP = Buffer.from(
  'UklGRiIAAABXRUJQVlA4IBYAAAAwAQCdASoBAAEADsD+JaQAA3AA/v89',
  'base64',
);

const VALID_VP8_CHUNK = Buffer.from(VALID_WEBP.subarray(12));

function buildWebpChunk(type: string, payload: Buffer): Buffer {
  const chunk = Buffer.alloc(8 + payload.length + (payload.length % 2));

  chunk.write(type, 0, 4, 'ascii');
  chunk.writeUInt32LE(payload.length, 4);
  payload.copy(chunk, 8);

  return chunk;
}

function buildWebpFile(...chunks: Buffer[]): Buffer {
  const buffer = Buffer.concat([
    Buffer.from('RIFF\0\0\0\0WEBP', 'binary'),
    ...chunks,
  ]);

  buffer.writeUInt32LE(buffer.length - 8, 4);

  return buffer;
}

function buildVp8xPayload(flags = 0, width = 1, height = 1): Buffer {
  const payload = Buffer.alloc(10);

  payload[0] = flags;
  payload.writeUIntLE(width - 1, 4, 3);
  payload.writeUIntLE(height - 1, 7, 3);

  return payload;
}

const WEBP_WITH_EMPTY_VP8_CHUNK = Buffer.from([
  0x52,
  0x49,
  0x46,
  0x46, // RIFF
  0x0c,
  0x00,
  0x00,
  0x00, // RIFF size = 12
  0x57,
  0x45,
  0x42,
  0x50, // WEBP
  0x56,
  0x50,
  0x38,
  0x20, // "VP8 "
  0x00,
  0x00,
  0x00,
  0x00, // empty chunk payload
]);

function buildExtendedWebp(includeImage = true): Buffer {
  return buildWebpFile(
    buildWebpChunk('VP8X', buildVp8xPayload()),
    ...(includeImage ? [VALID_VP8_CHUNK] : []),
  );
}

function buildOddPaddedWebp(): Buffer {
  return buildWebpFile(
    VALID_VP8_CHUNK,
    buildWebpChunk('JUNK', Buffer.from([0x2a])),
  );
}

function buildAnimatedWebp(): Buffer {
  const frameHeader = Buffer.alloc(16);
  frameHeader[12] = 1;

  return buildWebpFile(
    buildWebpChunk('VP8X', buildVp8xPayload(0x02)),
    buildWebpChunk('ANIM', Buffer.alloc(6)),
    buildWebpChunk('ANMF', Buffer.concat([frameHeader, VALID_VP8_CHUNK])),
  );
}

function buildAlphaWebp(): Buffer {
  return buildWebpFile(
    buildWebpChunk('VP8X', buildVp8xPayload(0x10)),
    buildWebpChunk('ALPH', Buffer.from([0x00, 0xff])),
    VALID_VP8_CHUNK,
  );
}

const TRUNCATED_WEBP = Buffer.from([0x52, 0x49, 0x46, 0x46, 0x00, 0x00]);

const GARBAGE = Buffer.from('this is definitely not an image');

describe('detectImageMimeType', () => {
  it('detects a structurally valid JPEG and walks entropy-coded data', () => {
    expect(detectImageMimeType(VALID_JPEG)).toBe('image/jpeg');
  });

  it('rejects a truncated JPEG missing the EOI trailer', () => {
    expect(detectImageMimeType(TRUNCATED_JPEG)).toBeNull();
  });

  it('rejects a JPEG whose segment length extends beyond the EOI marker', () => {
    expect(detectImageMimeType(JPEG_WITH_TRUNCATED_APP0_SEGMENT)).toBeNull();
  });

  it('accepts bounded metadata, DNL and TEM markers in a complete JPEG', () => {
    const withMetadata = Buffer.concat([
      Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x02]),
      VALID_JPEG.subarray(2),
    ]);
    const withDnlAndTem = Buffer.concat([
      VALID_JPEG.subarray(0, -2),
      Buffer.from([0xff, 0xdc, 0x00, 0x04, 0x00, 0x01, 0xff, 0x01]),
      VALID_JPEG.subarray(-2),
    ]);

    expect(detectImageMimeType(withMetadata)).toBe('image/jpeg');
    expect(detectImageMimeType(withDnlAndTem)).toBe('image/jpeg');
  });

  it.each([
    ['data outside a marker', [0xff, 0xd8, 0x42]],
    ['an unfinished marker prefix', [0xff, 0xd8, 0xff]],
    ['a stuffed byte outside scan data', [0xff, 0xd8, 0xff, 0x00]],
    ['a restart marker outside scan data', [0xff, 0xd8, 0xff, 0xd0]],
    ['a repeated SOI marker', [0xff, 0xd8, 0xff, 0xd8]],
    ['a segment without its length', [0xff, 0xd8, 0xff, 0xe0]],
    ['a segment length below two', [0xff, 0xd8, 0xff, 0xe0, 0x00, 0x01]],
    ['a short SOF header', [0xff, 0xd8, 0xff, 0xc0, 0x00, 0x02]],
    [
      'SOS before SOF',
      [
        0xff, 0xd8, 0xff, 0xda, 0x00, 0x08, 0x01, 0x01, 0x00, 0x00, 0x3f, 0x00,
        0xff, 0xd9,
      ],
    ],
  ])('rejects a JPEG with %s', (_scenario, bytes) => {
    expect(detectImageMimeType(Buffer.from(bytes))).toBeNull();
  });

  it('rejects incomplete SOF, SOS and scan endings', () => {
    const shortSos = Buffer.concat([
      VALID_JPEG.subarray(0, 15),
      Buffer.from([0xff, 0xda, 0x00, 0x02]),
    ]);

    expect(detectImageMimeType(shortSos)).toBeNull();
    expect(detectImageMimeType(VALID_JPEG.subarray(0, -2))).toBeNull();
  });

  it('detects a structurally valid PNG with mandatory chunks and CRCs', () => {
    expect(detectImageMimeType(VALID_PNG)).toBe('image/png');
  });

  it('rejects a PNG signature followed only by the IEND footer', () => {
    expect(detectImageMimeType(PNG_WITHOUT_IHDR_OR_IDAT)).toBeNull();
  });

  it('rejects a PNG chunk whose CRC does not match its type and data', () => {
    expect(detectImageMimeType(PNG_WITH_CORRUPTED_CRC)).toBeNull();
  });

  it('rejects a PNG with IHDR and IEND but no IDAT chunk', () => {
    expect(detectImageMimeType(PNG_WITHOUT_IDAT)).toBeNull();
  });

  it('rejects a truncated PNG missing the IEND footer', () => {
    expect(detectImageMimeType(TRUNCATED_PNG)).toBeNull();
  });

  it('accepts an indexed PNG with a bounded palette', () => {
    const indexedPng = buildPng(
      buildPngChunk('IHDR', buildPngHeader(3, 1)),
      buildPngChunk('PLTE', Buffer.from([0x00, 0x00, 0x00])),
      buildPngChunk('IDAT', Buffer.from([0x00])),
      buildPngChunk('IEND'),
    );

    expect(detectImageMimeType(indexedPng)).toBe('image/png');
  });

  it('accepts an ancillary PNG chunk after image data', () => {
    const png = buildPng(
      buildPngChunk('IHDR', buildPngHeader()),
      buildPngChunk('IDAT', Buffer.from([0x00])),
      buildPngChunk('tEXt', Buffer.from('key\0value')),
      buildPngChunk('IEND'),
    );

    expect(detectImageMimeType(png)).toBe('image/png');
  });

  it.each([
    ['zero width', 0, 1, 8, 6, 0, 0, 0],
    ['zero height', 1, 0, 8, 6, 0, 0, 0],
    ['invalid bit depth', 1, 1, 4, 6, 0, 0, 0],
    ['invalid color type', 1, 1, 8, 5, 0, 0, 0],
    ['invalid compression', 1, 1, 8, 6, 1, 0, 0],
    ['invalid filter', 1, 1, 8, 6, 0, 1, 0],
    ['invalid interlace', 1, 1, 8, 6, 0, 0, 2],
  ])(
    'rejects a PNG IHDR with %s',
    (
      _scenario,
      width,
      height,
      depth,
      color,
      compression,
      filter,
      interlace,
    ) => {
      const header = buildPngHeader(color, depth);
      header.writeUInt32BE(width, 0);
      header.writeUInt32BE(height, 4);
      header[10] = compression;
      header[11] = filter;
      header[12] = interlace;
      const png = buildPng(
        buildPngChunk('IHDR', header),
        buildPngChunk('IDAT', Buffer.from([0x00])),
        buildPngChunk('IEND'),
      );

      expect(detectImageMimeType(png)).toBeNull();
    },
  );

  it('rejects malformed PNG chunk boundaries and type codes', () => {
    const oversizedLength = Buffer.concat([PNG_SIGNATURE, Buffer.alloc(12)]);
    oversizedLength.writeUInt32BE(0x80000000, 8);
    const truncatedChunk = Buffer.concat([
      PNG_SIGNATURE,
      Buffer.from([0x00, 0x00, 0x00, 0x0d]),
      Buffer.from('IHDR'),
      Buffer.alloc(4),
    ]);
    const invalidType = Buffer.from(VALID_PNG);
    invalidType[12] = 0x00;
    const reservedType = Buffer.from(VALID_PNG);
    reservedType[14] = 0x64;

    expect(
      detectImageMimeType(Buffer.concat([PNG_SIGNATURE, Buffer.alloc(4)])),
    ).toBeNull();
    expect(detectImageMimeType(oversizedLength)).toBeNull();
    expect(detectImageMimeType(truncatedChunk)).toBeNull();
    expect(detectImageMimeType(invalidType)).toBeNull();
    expect(detectImageMimeType(reservedType)).toBeNull();
  });

  it('rejects invalid PNG ordering and critical chunks', () => {
    const headerChunk = buildPngChunk('IHDR', buildPngHeader());
    const dataChunk = buildPngChunk('IDAT', Buffer.from([0x00]));
    const endChunk = buildPngChunk('IEND');

    expect(
      detectImageMimeType(
        buildPng(headerChunk, headerChunk, dataChunk, endChunk),
      ),
    ).toBeNull();
    expect(
      detectImageMimeType(
        buildPng(
          headerChunk,
          dataChunk,
          buildPngChunk('tEXt'),
          dataChunk,
          endChunk,
        ),
      ),
    ).toBeNull();
    expect(
      detectImageMimeType(
        buildPng(headerChunk, buildPngChunk('ABCD'), dataChunk, endChunk),
      ),
    ).toBeNull();
  });

  it('detects a structurally valid WebP with a complete VP8 payload', () => {
    expect(detectImageMimeType(VALID_WEBP)).toBe('image/webp');
  });

  it('rejects a WebP whose VP8 chunk declares an empty payload', () => {
    expect(detectImageMimeType(WEBP_WITH_EMPTY_VP8_CHUNK)).toBeNull();
  });

  it('detects an extended WebP with valid VP8X and VP8 chunks', () => {
    expect(detectImageMimeType(buildExtendedWebp())).toBe('image/webp');
  });

  it('rejects a WebP containing VP8X metadata but no image chunk', () => {
    expect(detectImageMimeType(buildExtendedWebp(false))).toBeNull();
  });

  it('accepts valid VP8L, alpha and animated WebP structures', () => {
    const lossless = buildWebpFile(
      buildWebpChunk('VP8L', Buffer.from([0x2f, 0x00, 0x00, 0x00, 0x00, 0x00])),
    );
    const withColorProfile = buildWebpFile(
      buildWebpChunk('VP8X', buildVp8xPayload()),
      buildWebpChunk('ICCP', Buffer.from([0x01])),
      VALID_VP8_CHUNK,
    );

    expect(detectImageMimeType(lossless)).toBe('image/webp');
    expect(detectImageMimeType(buildAlphaWebp())).toBe('image/webp');
    expect(detectImageMimeType(buildAnimatedWebp())).toBe('image/webp');
    expect(detectImageMimeType(withColorProfile)).toBe('image/webp');
  });

  it('rejects invalid VP8 frame headers', () => {
    const payloads = Array.from({ length: 5 }, () =>
      Buffer.from(VALID_VP8_CHUNK.subarray(8)),
    );
    payloads[0][0] |= 0x01;
    payloads[1][0] &= ~0x10;
    payloads[2][3] = 0x00;
    payloads[3].writeUInt16LE(0, 6);
    payloads[4].writeUInt16LE(0, 8);

    for (const payload of payloads) {
      expect(
        detectImageMimeType(buildWebpFile(buildWebpChunk('VP8 ', payload))),
      ).toBeNull();
    }
  });

  it('rejects invalid VP8L and VP8X headers', () => {
    const invalidLosslessPayloads = [
      Buffer.from([0x2f, 0x00, 0x00, 0x00, 0x00]),
      Buffer.from([0x00, 0x00, 0x00, 0x00, 0x00, 0x00]),
      Buffer.from([0x2f, 0x00, 0x00, 0x00, 0xe0, 0x00]),
    ];
    const reservedFlag = buildVp8xPayload(0x80);
    const reservedByte = buildVp8xPayload();
    reservedByte[1] = 1;
    const oversizedCanvas = buildVp8xPayload(0, 65536, 65536);

    for (const payload of invalidLosslessPayloads) {
      expect(
        detectImageMimeType(buildWebpFile(buildWebpChunk('VP8L', payload))),
      ).toBeNull();
    }

    for (const payload of [
      Buffer.alloc(9),
      reservedFlag,
      reservedByte,
      oversizedCanvas,
    ]) {
      expect(
        detectImageMimeType(buildWebpFile(buildWebpChunk('VP8X', payload))),
      ).toBeNull();
    }
  });

  it('rejects malformed WebP chunk boundaries, padding and ordering', () => {
    const partialChunk = Buffer.concat([VALID_WEBP, Buffer.alloc(4)]);
    partialChunk.writeUInt32LE(partialChunk.length - 8, 4);
    const invalidPadding = buildOddPaddedWebp();
    invalidPadding[invalidPadding.length - 1] = 1;
    const structuralChunkAfterSimple = buildWebpFile(
      VALID_VP8_CHUNK,
      buildWebpChunk('VP8X', buildVp8xPayload()),
    );
    const duplicateExtendedHeader = buildWebpFile(
      buildWebpChunk('VP8X', buildVp8xPayload()),
      buildWebpChunk('VP8X', buildVp8xPayload()),
    );

    expect(detectImageMimeType(partialChunk)).toBeNull();
    expect(detectImageMimeType(invalidPadding)).toBeNull();
    expect(
      detectImageMimeType(
        buildWebpFile(buildWebpChunk('JUNK', Buffer.from([0x00]))),
      ),
    ).toBeNull();
    expect(detectImageMimeType(structuralChunkAfterSimple)).toBeNull();
    expect(detectImageMimeType(duplicateExtendedHeader)).toBeNull();
  });

  it('rejects incomplete alpha and animation structures', () => {
    const emptyProfile = buildWebpFile(
      buildWebpChunk('VP8X', buildVp8xPayload()),
      buildWebpChunk('ICCP', Buffer.alloc(0)),
      VALID_VP8_CHUNK,
    );
    const invalidAlpha = buildWebpFile(
      buildWebpChunk('VP8X', buildVp8xPayload(0x10)),
      buildWebpChunk('ALPH', Buffer.from([0xc0])),
      VALID_VP8_CHUNK,
    );
    const animationWithoutControl = buildWebpFile(
      buildWebpChunk('VP8X', buildVp8xPayload(0x02)),
      buildWebpChunk('ANMF', Buffer.alloc(16)),
    );
    const animationWithoutFrame = buildWebpFile(
      buildWebpChunk('VP8X', buildVp8xPayload(0x02)),
      buildWebpChunk('ANIM', Buffer.alloc(6)),
    );
    const shortAnimationFrame = buildWebpFile(
      buildWebpChunk('VP8X', buildVp8xPayload(0x02)),
      buildWebpChunk('ANIM', Buffer.alloc(6)),
      buildWebpChunk('ANMF', Buffer.alloc(15)),
    );

    expect(detectImageMimeType(emptyProfile)).toBeNull();
    expect(detectImageMimeType(invalidAlpha)).toBeNull();
    expect(detectImageMimeType(animationWithoutControl)).toBeNull();
    expect(detectImageMimeType(animationWithoutFrame)).toBeNull();
    expect(detectImageMimeType(shortAnimationFrame)).toBeNull();
  });

  it('tolerates the standard 1-byte RIFF pad for odd-length WebP chunks', () => {
    expect(detectImageMimeType(buildOddPaddedWebp())).toBe('image/webp');
  });

  it('rejects a truncated WebP missing WEBP/fourCC markers', () => {
    expect(detectImageMimeType(TRUNCATED_WEBP)).toBeNull();
  });

  it('rejects garbage/plain-text content', () => {
    expect(detectImageMimeType(GARBAGE)).toBeNull();
  });
});

describe('imageContentValidationMiddleware', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUnlink.mockResolvedValue(undefined);
  });

  function buildRequest(file?: { path: string; mimetype: string }): {
    file?: { path: string; mimetype: string };
  } {
    return { file };
  }

  it('calls next() with no error when there is no uploaded file (controller handles the 400 case)', async () => {
    const next = jest.fn();
    const request = buildRequest(undefined);

    await imageContentValidationMiddleware(request as never, {} as never, next);

    expect(next).toHaveBeenCalledWith();
    expect(mockReadFile).not.toHaveBeenCalled();
  });

  it('calls next() with no error when the declared MIME type matches the detected content (AC-003)', async () => {
    mockReadFile.mockResolvedValue(VALID_JPEG);
    const next = jest.fn();
    const request = buildRequest({
      path: '/tmp/uploads/valid.jpg',
      mimetype: 'image/jpeg',
    });

    await imageContentValidationMiddleware(request as never, {} as never, next);

    expect(next).toHaveBeenCalledWith();
    expect(mockUnlink).not.toHaveBeenCalled();
  });

  it('rejects with 415 and cleans up the temp file when the content is not a valid image (AC-001)', async () => {
    mockReadFile.mockResolvedValue(GARBAGE);
    const next = jest.fn();
    const request = buildRequest({
      path: '/tmp/uploads/spoofed.jpg',
      mimetype: 'image/jpeg',
    });

    await imageContentValidationMiddleware(request as never, {} as never, next);

    expect(next).toHaveBeenCalledWith(expect.any(HttpError));
    const forwardedError = next.mock.calls[0][0] as HttpError;
    expect(forwardedError.statusCode).toBe(415);
    expect(mockUnlink).toHaveBeenCalledWith('/tmp/uploads/spoofed.jpg');
  });

  it('rejects with 415 and cleans up the temp file when the content is truncated/corrupted (AC-002)', async () => {
    mockReadFile.mockResolvedValue(TRUNCATED_PNG);
    const next = jest.fn();
    const request = buildRequest({
      path: '/tmp/uploads/truncated.png',
      mimetype: 'image/png',
    });

    await imageContentValidationMiddleware(request as never, {} as never, next);

    expect(next).toHaveBeenCalledWith(expect.any(HttpError));
    const forwardedError = next.mock.calls[0][0] as HttpError;
    expect(forwardedError.statusCode).toBe(415);
    expect(mockUnlink).toHaveBeenCalledWith('/tmp/uploads/truncated.png');
  });

  it('rejects with 415 when declared and detected types are both individually allowed but disagree (AC-004, FR-004)', async () => {
    mockReadFile.mockResolvedValue(VALID_JPEG);
    const next = jest.fn();
    const request = buildRequest({
      path: '/tmp/uploads/mismatch.png',
      mimetype: 'image/png',
    });

    await imageContentValidationMiddleware(request as never, {} as never, next);

    expect(next).toHaveBeenCalledWith(expect.any(HttpError));
    const forwardedError = next.mock.calls[0][0] as HttpError;
    expect(forwardedError.statusCode).toBe(415);
    expect(mockUnlink).toHaveBeenCalledWith('/tmp/uploads/mismatch.png');
  });

  it('does not let a failed cleanup mask the 415 rejection (best-effort unlink)', async () => {
    mockReadFile.mockResolvedValue(GARBAGE);
    mockUnlink.mockRejectedValue(new Error('file already removed'));
    const next = jest.fn();
    const request = buildRequest({
      path: '/tmp/uploads/spoofed.jpg',
      mimetype: 'image/jpeg',
    });

    await imageContentValidationMiddleware(request as never, {} as never, next);

    expect(next).toHaveBeenCalledWith(expect.any(HttpError));
    const forwardedError = next.mock.calls[0][0] as HttpError;
    expect(forwardedError.statusCode).toBe(415);
  });

  it('attempts cleanup and forwards the original I/O error even when cleanup fails', async () => {
    const readError = new Error('permission denied');
    mockReadFile.mockRejectedValue(readError);
    mockUnlink.mockRejectedValue(new Error('cleanup failed'));
    const next = jest.fn();
    const request = buildRequest({
      path: '/tmp/uploads/broken.jpg',
      mimetype: 'image/jpeg',
    });

    await imageContentValidationMiddleware(request as never, {} as never, next);

    expect(next).toHaveBeenCalledWith(readError);
    expect(mockUnlink).toHaveBeenCalledWith('/tmp/uploads/broken.jpg');
  });
});
