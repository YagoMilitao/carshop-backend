import { z } from 'zod';

/**
 * Schema de edição administrativa de comentário.
 *
 * Motivo:
 * permitir alteração parcial, mas validar o que vier.
 */
export const updateCommentSchema = z
  .object({
    authorName: z
      .string()
      .trim()
      .min(2, 'Nome precisa ter pelo menos 2 caracteres.')
      .max(80, 'Nome pode ter no máximo 80 caracteres.')
      .optional(),

    content: z
      .string()
      .trim()
      .min(3, 'Comentário precisa ter pelo menos 3 caracteres.')
      .max(1000, 'Comentário pode ter no máximo 1000 caracteres.')
      .optional(),

    status: z.enum(['PENDING', 'APPROVED']).optional(),
  })
  .strict()
  .refine(
    (value) =>
      value.authorName !== undefined ||
      value.content !== undefined ||
      value.status !== undefined,
    {
      message: 'Informe ao menos um campo para atualização.',
    },
  );

export type UpdateCommentInput = z.infer<typeof updateCommentSchema>;
