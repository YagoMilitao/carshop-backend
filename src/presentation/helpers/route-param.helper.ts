import { HttpError } from '../../core/domain/application/ApplicationError/http-error';

/**
 * Garante que um parâmetro de rota seja uma string válida.
 *
 * Motivo:
 * centralizar a validação de params do Express
 * e evitar repetir essa checagem em vários controllers.
 */
export function requireStringRouteParam(
  value: string | string[] | undefined,
  paramName: string,
): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new HttpError(
      400,
      `${paramName} é obrigatório e deve ser uma string válida.`,
    );
  }

  return value;
}
