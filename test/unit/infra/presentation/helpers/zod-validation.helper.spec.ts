import { z } from 'zod';
import { HttpError } from '../../../../../src/core/domain/application/ApplicationError/http-error';
import { validateWithSchema } from '../../../../../src/infra/presentation/helpers/zod-validation.helper';

describe('validateWithSchema', () => {
  const schema = z.object({
    name: z.string().min(2),
  });

  it('retorna os dados parseados quando o input é válido', () => {
    const result = validateWithSchema(schema, { name: 'Maria' });

    expect(result).toEqual({ name: 'Maria' });
  });

  it('lança HttpError 400 quando o input é inválido', () => {
    expect(() => validateWithSchema(schema, { name: 'M' })).toThrow(
      HttpError,
    );

    try {
      validateWithSchema(schema, { name: 'M' });
      throw new Error('deveria ter lançado HttpError');
    } catch (error) {
      expect(error).toBeInstanceOf(HttpError);
      expect((error as HttpError).statusCode).toBe(400);
      expect((error as HttpError).message).toBe('Payload inválido.');
    }
  });
});
