import type { HomeImageSelection } from '../application/HomeImage/home-image.types';

/**
 * Dados necessários para gravar a seleção da imagem da Home.
 */
export interface SaveHomeImageSelectionInput {
  workId: string;
  imageId: string;
}

/**
 * Porta de persistência da configuração singleton da imagem da Home.
 *
 * Motivo:
 * isolar os use cases dos detalhes do Mongo. A implementação garante que
 * exista no máximo uma configuração (FR-001).
 */
export interface HomeImageSettingsRepositoryPort {
  /**
   * Retorna a seleção atual ou `undefined` quando nunca foi configurada.
   */
  find(): Promise<HomeImageSelection | undefined>;

  /**
   * Cria ou substitui a seleção atual, mantendo uma única configuração.
   */
  save(input: SaveHomeImageSelectionInput): Promise<HomeImageSelection>;
}
