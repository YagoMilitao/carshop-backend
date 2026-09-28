import { z } from 'zod';

const SET_HOME_IMAGE_FIELDS = new Set(['workId', 'imageId']);

/**
 * Identificadores aceitos: letras, dígitos e hífen (ex.: UUID).
 *
 * Motivo:
 * rejeitar URLs e valores com `:`, `/` ou `.`, garantindo que a seleção
 * sempre referencie uma imagem gerenciada pelo sistema (FR-007/AC-008).
 */
const IDENTIFIER_PATTERN = /^[A-Za-z0-9-]+$/;

const identifierSchema = z
  .string()
  .trim()
  .min(1)
  .max(64)
  .regex(IDENTIFIER_PATTERN);

/**
 * Valida as chaves do objeto original antes de o Zod reconstruí-lo.
 *
 * Motivo:
 * propriedades especiais como `__proto__` podem ser descartadas durante o
 * parse de `z.object()`, o que faria `.strict()` deixar de enxergá-las.
 */
const rawSetHomeImageSchema = z.unknown().superRefine((value, context) => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return;
  }

  const hasNonAllowlistedKey = Object.keys(value).some(
    (key) => !SET_HOME_IMAGE_FIELDS.has(key),
  );

  if (hasNonAllowlistedKey) {
    context.addIssue({
      code: 'custom',
      message: 'Payload contém campos não permitidos.',
    });
  }
});

const parsedSetHomeImageSchema = z
  .object({
    workId: identifierSchema,
    imageId: identifierSchema,
  })
  .strict();

/**
 * Schema da seleção da imagem principal da Home (CARSHOP-159).
 *
 * Motivo:
 * aceitar exclusivamente a referência `{ workId, imageId }` de uma imagem
 * existente; qualquer campo extra (inclusive `url`) é rejeitado.
 */
export const setHomeImageSchema = rawSetHomeImageSchema.pipe(
  parsedSetHomeImageSchema,
);

export type SetHomeImageSchemaInput = z.infer<typeof setHomeImageSchema>;
