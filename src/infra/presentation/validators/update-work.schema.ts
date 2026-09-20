import { z } from 'zod';

/**
 * Schema de edição parcial de trabalho.
 *
 * Motivo:
 * validar apenas o formato/tipo dos dados de entrada na fronteira HTTP.
 * Regras de negócio (normalização, duplicidade de slug, etc.) permanecem
 * em `UpdateWorkUseCase`/`MongoWorkRepository`.
 *
 * Os limites de `title` (120) e `description` (5000) espelham
 * `work.model.ts`.
 */
export const updateWorkSchema = z
  .object({
    slug: z.string().trim().min(1).max(120).optional(),
    title: z.string().trim().min(1).max(120).optional(),
    description: z.string().trim().min(1).max(5000).optional(),
    category: z.string().trim().min(1).optional(),
    tags: z.array(z.string()).optional(),
    status: z.enum(['draft', 'published']).optional(),
  })
  .strict()
  .refine(
    (value) => Object.values(value).some((field) => field !== undefined),
    {
      message: 'Informe ao menos um campo para atualização.',
    },
  );

/**
 * Tipo inferido automaticamente a partir do schema.
 *
 * Motivo:
 * evita duplicar tipagem manual.
 */
export type UpdateWorkSchemaInput = z.infer<typeof updateWorkSchema>;
