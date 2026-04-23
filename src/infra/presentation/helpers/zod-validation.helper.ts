import { HttpError } from '@/core/domain/application/ApplicationError/http-error';
import { z, type ZodType } from 'zod';

/**
 * Valida um payload com Zod.
 *
 * Motivo:
 * centralizar a transformação de erro do Zod em HttpError,
 * mantendo o controller limpo.
 */
export function validateWithSchema<TOutput>(
  schema: ZodType<TOutput>,
  input: unknown,
): TOutput {
  const result = schema.safeParse(input);

  if (!result.success) {
    throw new HttpError(400, 'Payload inválido.', z.flattenError(result.error));
  }

  return result.data;
}
