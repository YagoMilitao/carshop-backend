import { z } from 'zod';

const UPDATE_WORK_FIELDS = new Set([
  'slug',
  'title',
  'description',
  'category',
  'tags',
  'status',
]);

/**
 * Valida as chaves do objeto original antes de o Zod reconstruí-lo.
 *
 * Motivo:
 * propriedades especiais como `__proto__` podem ser descartadas durante o
 * parse de `z.object()`, o que faria `.strict()` deixar de enxergá-las.
 */
const rawUpdateWorkSchema = z.unknown().superRefine((value, context) => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return;
  }

  const hasNonAllowlistedKey = Object.keys(value).some(
    (key) => !UPDATE_WORK_FIELDS.has(key),
  );

  if (hasNonAllowlistedKey) {
    context.addIssue({
      code: 'custom',
      message: 'Payload contém campos não permitidos.',
    });
  }
});

/**
 * Schema de edição parcial de trabalho.
 *
 * Motivo:
 * validar apenas o formato/tipo dos dados de entrada na fronteira HTTP.
 * Regras de negócio (normalização, duplicidade de slug, etc.) permanecem
 * em `UpdateWorkUseCase`/`MongoWorkRepository`.
 *
 * Os limites de `title` (120), `description` (5000) e `category` (120)
 * espelham o contrato canônico da API.
 */
const parsedUpdateWorkSchema = z
  .object({
    slug: z.string().trim().min(1).max(120).optional(),
    title: z.string().trim().min(1).max(120).optional(),
    description: z.string().trim().min(1).max(5000).optional(),
    category: z.string().trim().min(1).max(120).optional(),
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

export const updateWorkSchema = rawUpdateWorkSchema.pipe(
  parsedUpdateWorkSchema,
);

/**
 * Tipo inferido automaticamente a partir do schema.
 *
 * Motivo:
 * evita duplicar tipagem manual.
 */
export type UpdateWorkSchemaInput = z.infer<typeof updateWorkSchema>;
