import { z } from 'zod';

/**
 * Schema de criação de trabalho.
 *
 * Motivo:
 * validar apenas o formato/tipo dos dados de entrada na fronteira HTTP.
 * Regras de negócio (não vazio após trim, duplicidade de slug, etc.)
 * permanecem em `CreateWorkUseCase`, evitando duplicar/divergir mensagens
 * de erro já testadas.
 */
export const createWorkSchema = z
  .object({
    slug: z.string(),
    title: z.string(),
    description: z.string(),
    category: z.string(),
    tags: z.array(z.string()).optional().default([]),
    status: z.enum(['draft', 'published']).optional().default('draft'),
  })
  .strict();

/**
 * Tipo inferido automaticamente a partir do schema.
 *
 * Motivo:
 * evita duplicar tipagem manual.
 */
export type CreateWorkSchemaInput = z.infer<typeof createWorkSchema>;
