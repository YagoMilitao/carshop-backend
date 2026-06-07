import { v2 as cloudinary } from 'cloudinary';
import {
  ImageStoragePort,
  UploadImageResult,
} from '../../Storage/image-storage.port';

/**
 * Adapter concreto de storage usando Cloudinary.
 *
 * Motivo:
 * implementar a porta ImageStoragePort sem acoplar
 * os use cases diretamente ao Cloudinary.
 */
export class CloudinaryStorageService implements ImageStoragePort {
  constructor() {
    cloudinary.config({
      cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
      api_key: process.env.CLOUDINARY_API_KEY,
      api_secret: process.env.CLOUDINARY_API_SECRET,
    });
  }

  /**
   * Faz upload da imagem local para o Cloudinary.
   */
  async upload(filePath: string): Promise<UploadImageResult> {
    const result = await cloudinary.uploader.upload(filePath, {
      folder: 'carshop/works',
      resource_type: 'image',
    });

    return {
      url: result.secure_url,
      publicId: result.public_id,
    };
  }

  /**
   * Remove a imagem do Cloudinary usando publicId.
   */
  async delete(publicId: string): Promise<void> {
    await cloudinary.uploader.destroy(publicId, {
      resource_type: 'image',
    });
  }
}
