import { z } from 'zod';

/**
 * Schema de criação de comentário.
 *
 * Motivo:
 * validar dados de entrada antes de chegar na regra de negócio.
 */
export const createCommentSchema = z.object({
  authorName: z
    .string()
    .trim()
    .min(2, 'Nome precisa ter pelo menos 2 caracteres.')
    .max(80, 'Nome pode ter no máximo 80 caracteres.'),

  content: z
    .string()
    .trim()
    .min(3, 'Comentário precisa ter pelo menos 3 caracteres.')
    .max(1000, 'Comentário pode ter no máximo 1000 caracteres.'),
});

/**
 * Tipo inferido automaticamente a partir do schema.
 *
 * Motivo:
 * evita duplicar tipagem manual.
 */
export type CreateCommentInput = z.infer<typeof createCommentSchema>;
