import {
  v2 as cloudinary,
  type UploadApiErrorResponse,
  type UploadApiResponse,
} from 'cloudinary';

import type {
  ImageStoragePort,
  UploadImageInput,
  UploadImageResult,
} from '../../../core/domain/application/Storage/image-storage.port';

/**
 * Implementação concreta do armazenamento usando Cloudinary.
 *
 * O arquivo é enviado diretamente da memória, sem ser salvo
 * temporariamente no disco do servidor.
 */
export class CloudinaryStorageService implements ImageStoragePort {
  constructor() {
    const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
    const apiKey = process.env.CLOUDINARY_API_KEY;
    const apiSecret = process.env.CLOUDINARY_API_SECRET;

    if (!cloudName || !apiKey || !apiSecret) {
      throw new Error(
        'As variáveis do Cloudinary não foram configuradas corretamente.',
      );
    }

    cloudinary.config({
      cloud_name: cloudName,
      api_key: apiKey,
      api_secret: apiSecret,
      secure: true,
    });
  }

  /**
   * Envia um Buffer diretamente ao Cloudinary.
   *
   * Motivo:
   * não criar arquivo temporário reduz a chance de lixo no disco
   * e funciona melhor em hospedagens com filesystem efêmero.
   */
  async upload(input: UploadImageInput): Promise<UploadImageResult> {
    return new Promise<UploadImageResult>((resolve, reject) => {
      const uploadStream = cloudinary.uploader.upload_stream(
        {
          folder: input.folder,
          resource_type: 'image',

          /**
           * O Cloudinary cria o identificador final.
           * use_filename ajuda a manter nomes reconhecíveis,
           * mas unique_filename impede colisões.
           */
          use_filename: true,
          unique_filename: true,
          overwrite: false,
        },
        (
          error: UploadApiErrorResponse | undefined,
          result: UploadApiResponse | undefined,
        ) => {
          if (error) {
            reject(new Error(`Falha no upload da imagem: ${error.message}`));
            return;
          }

          if (!result?.secure_url || !result.public_id) {
            reject(new Error('O Cloudinary não retornou os dados da imagem.'));
            return;
          }

          resolve({
            url: result.secure_url,
            publicId: result.public_id,
          });
        },
      );

      uploadStream.end(input.buffer);
    });
  }

  /**
   * Exclui uma imagem pelo publicId.
   *
   * "not found" é considerado sucesso porque torna a operação
   * idempotente: repetir o hard delete não causa falha.
   */
  async delete(publicId: string): Promise<void> {
    const result = await cloudinary.uploader.destroy(publicId, {
      resource_type: 'image',
      invalidate: true,
    });

    if (result.result !== 'ok' && result.result !== 'not found') {
      throw new Error(
        `Não foi possível excluir a imagem "${publicId}" do Cloudinary.`,
      );
    }
  }
}
