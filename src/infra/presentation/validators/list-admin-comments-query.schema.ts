import { z } from 'zod';

/**
 * Schema de query params da listagem administrativa de comentários.
 *
 * Motivo:
 * validar e normalizar `status`/`page`/`limit` na camada de apresentação
 * antes de alcançar o use case/repositório (NFR-002).
 */
export const listAdminCommentsQuerySchema = z
  .object({
    status: z.enum(['PENDING', 'APPROVED', 'HIDDEN']).optional(),
    page: z.coerce.number().int().min(1).optional().default(1),
    limit: z.coerce.number().int().min(1).max(100).optional().default(20),
  })
  .strict();

export type ListAdminCommentsQueryInput = z.infer<
  typeof listAdminCommentsQuerySchema
>;
