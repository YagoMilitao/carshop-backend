import { z } from 'zod';

/**
 * Schema dos campos de texto (multipart) do upload de imagem de um work.
 *
 * Motivo:
 * validar apenas o formato dos campos `alt`/`isCover` recebidos via
 * multipart/form-data, preservando o comportamento tolerante já existente
 * no controller (ambos opcionais; `isCover` só é tratado como verdadeiro
 * quando igual à string 'true').
 */
export const uploadWorkImageBodySchema = z
  .object({
    alt: z
      .string()
      .max(160, 'Alt pode ter no máximo 160 caracteres.')
      .optional(),
    isCover: z.string().optional(),
  })
  .strict();

/**
 * Tipo inferido automaticamente a partir do schema.
 *
 * Motivo:
 * evita duplicar tipagem manual.
 */
export type UploadWorkImageBodyInput = z.infer<
  typeof uploadWorkImageBodySchema
>;
