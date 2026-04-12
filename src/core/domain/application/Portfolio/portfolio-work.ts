/**
 * Status do trabalho no portfólio.
 *
 * draft:
 *   ainda não deve aparecer publicamente.
 *
 * published:
 *   já pode ser exibido no site.
 */
export type PortfolioWorkStatus = 'draft' | 'published';

/**
 * Imagem associada a um trabalho.
 *
 * url:
 *   endereço da imagem já publicada.
 *
 * alt:
 *   texto alternativo para acessibilidade e SEO.
 *
 * isCover:
 *   indica se a imagem é a capa principal do trabalho.
 */
export interface PortfolioWorkImage {
  url: string;
  alt: string;
  isCover: boolean;
}

/**
 * Metadados do trabalho.
 *
 * clientName:
 *   nome do cliente, se você quiser exibir ou guardar internamente.
 *
 * vehicleModel:
 *   modelo do carro.
 *
 * vehicleBrand:
 *   marca do carro.
 *
 * serviceDate:
 *   data em que o serviço foi realizado.
 *
 * estimatedDurationInDays:
 *   duração estimada do serviço.
 *
 * seoTitle / seoDescription:
 *   úteis para SEO e páginas mais bem descritas no frontend.
 */
export interface PortfolioWorkMetadata {
  clientName?: string;
  vehicleModel?: string;
  vehicleBrand?: string;
  serviceDate?: string;
  estimatedDurationInDays?: number;
  seoTitle?: string;
  seoDescription?: string;
}

/**
 * Entidade principal do trabalho do portfólio.
 *
 * slug:
 *   identificador amigável para URL, ex: "reforma-banco-couro-civic"
 *
 * title:
 *   título principal do trabalho.
 *
 * description:
 *   descrição detalhada do serviço.
 *
 * category:
 *   categoria principal do trabalho, ex: "bancos", "tetos", "portas"
 *
 * tags:
 *   lista livre de marcadores, ex: ["couro", "honda", "civic"]
 *
 * images:
 *   galeria do trabalho
 *
 * metadata:
 *   dados complementares do trabalho
 */
export interface PortfolioWork {
  id: string;
  slug: string;
  title: string;
  description: string;
  category: string;
  tags: string[];
  images: PortfolioWorkImage[];
  metadata: PortfolioWorkMetadata;
  status: PortfolioWorkStatus;
  createdAt: string;
  updatedAt: string;
}
