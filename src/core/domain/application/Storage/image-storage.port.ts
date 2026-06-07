/**
 * Resultado retornado depois do upload.
 *
 * Motivo:
 * a aplicação só precisa saber a URL pública
 * e o identificador necessário para deletar depois.
 */
export interface UploadImageResult {
  url: string;
  publicId: string;
}

/**
 * Porta de storage de imagem.
 *
 * Motivo:
 * manter Cloudinary fora da regra de negócio.
 * Se trocar para S3 depois, os use cases não mudam.
 */
export interface ImageStoragePort {
  upload(filePath: string): Promise<UploadImageResult>;
  delete(publicId: string): Promise<void>;
}
