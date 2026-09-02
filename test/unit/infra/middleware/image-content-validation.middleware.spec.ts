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

const TRUNCATED_PNG = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
]);

const VALID_WEBP = Buffer.from(
  'UklGRiIAAABXRUJQVlA4IBYAAAAwAQCdASoBAAEADsD+JaQAA3AA/v89',
  'base64',
);

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
  const buffer = Buffer.concat([
    Buffer.from([
      0x52,
      0x49,
      0x46,
      0x46, // RIFF
      0x00,
      0x00,
      0x00,
      0x00, // RIFF size, filled below
      0x57,
      0x45,
      0x42,
      0x50, // WEBP
      0x56,
      0x50,
      0x38,
      0x58, // VP8X
      0x0a,
      0x00,
      0x00,
      0x00, // chunk size = 10
      0x00,
      0x00,
      0x00,
      0x00, // flags + reserved bytes
      0x00,
      0x00,
      0x00, // canvas width minus one
      0x00,
      0x00,
      0x00, // canvas height minus one
    ]),
    includeImage ? VALID_WEBP.subarray(12) : Buffer.alloc(0),
  ]);

  buffer.writeUInt32LE(buffer.length - 8, 4);

  return buffer;
}

function buildOddPaddedWebp(): Buffer {
  const buffer = Buffer.concat([
    VALID_WEBP,
    Buffer.from([
      0x4a,
      0x55,
      0x4e,
      0x4b, // JUNK
      0x01,
      0x00,
      0x00,
      0x00, // chunk size = 1
      0x2a, // payload
      0x00, // required RIFF padding
    ]),
  ]);

  buffer.writeUInt32LE(buffer.length - 8, 4);

  return buffer;
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
