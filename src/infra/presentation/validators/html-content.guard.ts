/**
 * Padrões de detecção de markup HTML/script.
 *
 * Motivo:
 * centralizar a checagem usada pelo schema de comentários, evitando
 * duplicação em múltiplos pontos de validação (NFR-003).
 */
const HTML_TAG_PATTERN = /<\/?[a-zA-Z][\w-]*(?:[\s/][^<>]*)?>/;
const HTML_ENCODED_ANGLE_BRACKET_PATTERN = /&(lt|gt|#60|#62|#x3c|#x3e);/i;
const EVENT_HANDLER_ATTRIBUTE_PATTERN = /\bon[a-z]+\s*=/i;
const JAVASCRIPT_URI_PATTERN = /javascript\s*:/i;

/**
 * Detecta markup HTML ou construções de script em um valor de texto.
 *
 * Motivo:
 * impedir que comentários com tags, entidades HTML, atributos de evento
 * (`on*=`) ou URIs `javascript:` sejam persistidos (FR-001, FR-002).
 */
export function containsHtmlOrScriptMarkup(value: string): boolean {
  return (
    HTML_TAG_PATTERN.test(value) ||
    HTML_ENCODED_ANGLE_BRACKET_PATTERN.test(value) ||
    EVENT_HANDLER_ATTRIBUTE_PATTERN.test(value) ||
    JAVASCRIPT_URI_PATTERN.test(value)
  );
}
