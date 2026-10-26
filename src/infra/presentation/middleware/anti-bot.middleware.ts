import type { RequestHandler } from 'express';
import { HttpError } from '../../../core/domain/application/ApplicationError/http-error';

/**
 * Nome do campo de controle anti-automação aceito em
 * `POST /works/{workId}/comments` (CARSHOP-140).
 *
 * Motivo:
 * - centralizar o nome do campo para o middleware e para o schema Zod
 *   (`createCommentSchema`) permanecerem alinhados
 * - o campo é opcional: ausente ou string vazia significam envio legítimo
 */
export const COMMENT_HONEYPOT_FIELD = 'website';

/**
 * Indica se o campo de controle anti-automação foi preenchido no body.
 *
 * Política (determinística, fail-closed para valor malformado):
 * - body que não é objeto simples (`undefined`, `null`, array, string etc.)
 *   não dispara a proteção; a validação de payload existente responde
 * - campo ausente, ou presente apenas via protótipo, não dispara
 * - campo exatamente igual a `''` (sem trim) não dispara
 * - qualquer outro valor (string não vazia, inclusive só espaços, número,
 *   `null`, boolean, objeto, array) dispara
 *
 * Motivo:
 * - função pura, sem dependência de Express, para facilitar testes
 * - nunca considera headers (inclusive `User-Agent`) na decisão
 */
export function isHoneypotTriggered(body: unknown, fieldName: string): boolean {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    return false;
  }

  if (!Object.hasOwn(body, fieldName)) {
    return false;
  }

  const fieldValue: unknown = (body as Record<string, unknown>)[fieldName];

  return fieldValue !== '';
}

/**
 * Middleware anti-automação da criação pública de comentários (CARSHOP-140).
 *
 * Estratégia:
 * - rejeita com `400 { "message": "Payload inválido." }`, sem `details`,
 *   quando o campo de controle vem preenchido
 * - mesmo status e mesma `message` de um payload inválido comum, sem
 *   `details` e sem revelar o mecanismo, o nome do campo ou detalhes internos
 * - não lê headers, não registra body e não depende de configuração
 *
 * Deve ser registrado após `commentRateLimitMiddleware`, para que
 * rejeições continuem contando no limitador de comentários.
 */
export const commentAntiBotMiddleware: RequestHandler = (
  request,
  _response,
  next,
) => {
  try {
    if (isHoneypotTriggered(request.body, COMMENT_HONEYPOT_FIELD)) {
      next(new HttpError(400, 'Payload inválido.'));
      return;
    }

    next();
  } catch (error: unknown) {
    next(error);
  }
};
