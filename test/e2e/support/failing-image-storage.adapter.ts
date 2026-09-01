import type {
  ImageStoragePort,
  UploadImageInput,
  UploadImageResult,
} from '../../../src/core/domain/application/Storage/image-storage.port';

/**
 * Test double for `ImageStoragePort` used only by
 * `security-error-leakage.e2e-spec.ts` (AC-006) to deterministically force
 * a generic HTTP 500 through the real error-handling pipeline, without any
 * real network call to Cloudinary.
 *
 * Motivo:
 * `MongoWorkRepository.findById()` queries by the app's own string id
 * field (not Mongo `_id`), so a malformed work id does not naturally
 * produce a Mongoose `CastError`/500. Injecting this double via the
 * existing `createApp({ imageStorage })` composition-root override seam
 * lets the suite exercise a genuine unexpected-failure path
 * (`errorHandlerMiddleware`'s generic branch) without touching `src/` or
 * weakening any production control.
 */
export class FailingImageStorageAdapter implements ImageStoragePort {
  async upload(_input: UploadImageInput): Promise<UploadImageResult> {
    await Promise.resolve();
    throw new Error('Simulated upstream failure.');
  }

  async delete(_publicId: string): Promise<void> {
    await Promise.resolve();
    throw new Error('Simulated upstream failure.');
  }
}
