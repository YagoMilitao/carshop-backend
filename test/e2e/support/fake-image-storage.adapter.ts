import { randomUUID } from 'node:crypto';
import type {
  ImageStoragePort,
  UploadImageInput,
  UploadImageResult,
} from '../../../src/core/domain/application/Storage/image-storage.port';

/**
 * Test double for `ImageStoragePort` used by permanent E2E specs.
 *
 * Motivo:
 * evita qualquer chamada de rede real ao Cloudinary durante os testes
 * E2E (CARSHOP-103), preservando o contrato assíncrono e o
 * comportamento idempotente de `delete()` documentado na ADR-002
 * ("not found" também é sucesso). Nunca aponta para um domínio real do
 * Cloudinary ou de produção.
 */
export class FakeImageStorageAdapter implements ImageStoragePort {
  async upload(_input: UploadImageInput): Promise<UploadImageResult> {
    await Promise.resolve();

    const publicId = `carshop/e2e/${randomUUID()}`;

    return {
      publicId,
      url: `https://fake-cloudinary.e2e.test/${publicId}.jpg`,
    };
  }

  async delete(_publicId: string): Promise<void> {
    // Idempotente por design: mesmo um publicId nunca enviado deve
    // resolver com sucesso, espelhando a ADR-002.
    await Promise.resolve();
  }
}
