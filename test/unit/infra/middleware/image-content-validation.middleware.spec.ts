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
  0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01,
  0xff, 0xd9,
]);

const TRUNCATED_JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);

const VALID_PNG = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x00,
  0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82,
]);

const TRUNCATED_PNG = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
]);

function buildValidWebp(): Buffer {
  return Buffer.from([
    0x52, 0x49, 0x46, 0x46, // RIFF
    0x0c, 0x00, 0x00, 0x00, // size = 12 (LE)
    0x57, 0x45, 0x42, 0x50, // WEBP
    0x56, 0x50, 0x38, 0x20, // "VP8 "
    0x00, 0x00, 0x00, 0x00, // filler payload
  ]);
}

function buildOddPaddedWebp(): Buffer {
  // size (11) covers "WEBP" + fourCC + 3-byte payload; the encoder pads
  // the file with 1 extra trailing byte, so buffer.length = size + 9.
  return Buffer.from([
    0x52, 0x49, 0x46, 0x46, // RIFF
    0x0b, 0x00, 0x00, 0x00, // size = 11 (LE)
    0x57, 0x45, 0x42, 0x50, // WEBP
    0x56, 0x50, 0x38, 0x4c, // "VP8L"
    0x00, 0x00, 0x00, // 3-byte payload
    0x00, // 1-byte pad
  ]);
}

const TRUNCATED_WEBP = Buffer.from([0x52, 0x49, 0x46, 0x46, 0x00, 0x00]);

const GARBAGE = Buffer.from('this is definitely not an image');

describe('detectImageMimeType', () => {
  it('detects a structurally valid JPEG (SOI + EOI)', () => {
    expect(detectImageMimeType(VALID_JPEG)).toBe('image/jpeg');
  });

  it('rejects a truncated JPEG missing the EOI trailer', () => {
    expect(detectImageMimeType(TRUNCATED_JPEG)).toBeNull();
  });

  it('detects a structurally valid PNG (signature + IEND footer)', () => {
    expect(detectImageMimeType(VALID_PNG)).toBe('image/png');
  });

  it('rejects a truncated PNG missing the IEND footer', () => {
    expect(detectImageMimeType(TRUNCATED_PNG)).toBeNull();
  });

  it('detects a structurally valid WebP (RIFF/WEBP + consistent size)', () => {
    expect(detectImageMimeType(buildValidWebp())).toBe('image/webp');
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

    await imageContentValidationMiddleware(
      request as never,
      {} as never,
      next,
    );

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

    await imageContentValidationMiddleware(
      request as never,
      {} as never,
      next,
    );

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

    await imageContentValidationMiddleware(
      request as never,
      {} as never,
      next,
    );

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

    await imageContentValidationMiddleware(
      request as never,
      {} as never,
      next,
    );

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

    await imageContentValidationMiddleware(
      request as never,
      {} as never,
      next,
    );

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

    await imageContentValidationMiddleware(
      request as never,
      {} as never,
      next,
    );

    expect(next).toHaveBeenCalledWith(expect.any(HttpError));
    const forwardedError = next.mock.calls[0][0] as HttpError;
    expect(forwardedError.statusCode).toBe(415);
  });

  it('forwards unexpected I/O errors as-is via next(error)', async () => {
    const readError = new Error('permission denied');
    mockReadFile.mockRejectedValue(readError);
    const next = jest.fn();
    const request = buildRequest({
      path: '/tmp/uploads/broken.jpg',
      mimetype: 'image/jpeg',
    });

    await imageContentValidationMiddleware(
      request as never,
      {} as never,
      next,
    );

    expect(next).toHaveBeenCalledWith(readError);
    expect(mockUnlink).not.toHaveBeenCalled();
  });
});
