/**
 * Dados necessários para enviar uma imagem ao storage.
 *
 * O domínio trabalha com Buffer e não conhece Multer,
 * Cloudinary, arquivos temporários ou caminhos locais.
 */
export interface UploadImageInput {
  buffer: Buffer;
  mimeType: string;
  originalName: string;
  folder: string;
}

/**
 * Resultado devolvido pelo storage após o upload.
 *
 * A URL será usada para exibição.
 * O publicId será usado para exclusão futura.
 */
export interface UploadImageResult {
  url: string;
  publicId: string;
}

/**
 * Porta de armazenamento externo.
 *
 * Motivo:
 * os casos de uso dependem deste contrato, não do Cloudinary.
 * Isso permite trocar futuramente para S3 sem alterar a regra de negócio.
 */
export interface ImageStoragePort {
  upload(input: UploadImageInput): Promise<UploadImageResult>;

  delete(publicId: string): Promise<void>;
}
