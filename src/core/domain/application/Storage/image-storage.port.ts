/**
 * Resultado de upload de imagem.
 */
export interface UploadImageResult {
  url: string;
  publicId: string;
}

/**
 * Porta de armazenamento.
 *
 * Motivo:
 * o domínio não pode conhecer Cloudinary,
 * S3 ou qualquer fornecedor.
 */
export interface ImageStoragePort {
  upload(filePath: string): Promise<UploadImageResult>;

  delete(publicId: string): Promise<void>;
}
