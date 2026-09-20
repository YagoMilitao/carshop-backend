import type {
  Work,
  WorkImage,
} from '../../core/domain/application/Work/work.types';

/**
 * Imagem de um trabalho exposta em respostas públicas.
 *
 * Motivo:
 * `publicId` é um identificador interno do Cloudinary sem valor para o
 * contrato público e não deve ser exposto fora de contextos administrativos.
 */
export type PublicWorkImage = Omit<WorkImage, 'publicId'>;

/**
 * Trabalho exposto em respostas públicas.
 *
 * Motivo:
 * `deletedAt` é um detalhe de implementação de soft delete sem valor
 * funcional em respostas públicas.
 */
export type PublicWorkResponse = Omit<Work, 'deletedAt' | 'images'> & {
  images: PublicWorkImage[];
};

/**
 * Mapeia um `Work` completo para o formato minimizado exposto em respostas
 * públicas, removendo `deletedAt` e `images[].publicId`.
 *
 * Motivo:
 * manter a minimização de resposta como uma preocupação de fronteira de
 * apresentação, preservando o formato interno completo usado por
 * casos de uso e repositórios.
 */
export function toPublicWorkResponse(work: Work): PublicWorkResponse {
  return {
    id: work.id,
    slug: work.slug,
    title: work.title,
    description: work.description,
    category: work.category,
    tags: work.tags,
    status: work.status,
    createdAt: work.createdAt,
    updatedAt: work.updatedAt,
    images: work.images.map(toPublicWorkImage),
  };
}

function toPublicWorkImage(image: WorkImage): PublicWorkImage {
  return {
    id: image.id,
    url: image.url,
    alt: image.alt,
    isCover: image.isCover,
    order: image.order,
    createdAt: image.createdAt,
    updatedAt: image.updatedAt,
  };
}
