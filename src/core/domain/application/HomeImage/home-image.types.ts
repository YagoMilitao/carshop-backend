import type { Work } from '../Work/work.types';

/**
 * Referência persistida da imagem principal da Home (CARSHOP-159).
 *
 * Motivo:
 * a configuração guarda apenas a referência estável para uma imagem já
 * gerenciada pelo sistema (`workId` + `imageId`, AD-001). A URL e o texto
 * alternativo são resolvidos a partir do Work no momento da leitura, para
 * nunca servir uma URL fornecida pelo cliente (FR-007).
 */
export interface HomeImageSelection {
  workId: string;
  imageId: string;
  updatedAt: string;
}

/**
 * Imagem principal da Home já resolvida para exposição via API.
 *
 * Motivo:
 * contém somente o necessário para renderizar a Home. Identificadores
 * internos do storage (`publicId`) nunca fazem parte deste tipo (NFR-003).
 * Dimensões não existem no sistema e, por isso, são omitidas (AD-004).
 */
export interface HomeImage {
  workId: string;
  imageId: string;
  url: string;
  alt: string;
}

/**
 * Regra de elegibilidade de um Work para fornecer a imagem da Home (AD-003).
 *
 * Motivo:
 * somente works publicados e não removidos logicamente podem expor imagens
 * na Home pública. A mesma regra é aplicada na seleção e na leitura.
 */
export function isWorkEligibleForHomeImage(work: Work): boolean {
  return work.status === 'published' && !work.deletedAt;
}
