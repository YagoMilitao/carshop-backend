import { createHash } from 'node:crypto';
import type { Request } from 'express';
import rateLimit, {
  ipKeyGenerator,
  type RateLimitRequestHandler,
} from 'express-rate-limit';

/**
 * Cria um rate limiter reutilizável.
 *
 * Motivo:
 * - evitar duplicação de configuração
 * - facilitar criação de limitadores específicos por rota no futuro
 * - manter tipagem forte
 */
function createRateLimiter(options: any): RateLimitRequestHandler {
  return rateLimit(options);
}

/**
 * Rate limit global da aplicação.
 *
 * Estratégia escolhida:
 * - janela de 15 minutos
 * - até 100 requisições por IP nessa janela
 *
 * Motivo:
 * - valor razoável para ambiente inicial
 * - protege contra flood básico
 * - ainda não é agressivo demais para desenvolvimento
 */
export const globalRateLimitMiddleware: RateLimitRequestHandler =
  createRateLimiter({
    windowMs: 15 * 60 * 1000,
    limit: 100,

    /**
     * standardHeaders: true
     * adiciona headers padrão de rate limit na resposta.
     *
     * Motivo:
     * ajuda cliente/frontend e debugging a entenderem
     * quanto falta para o próximo reset.
     */
    standardHeaders: true,

    /**
     * legacyHeaders: false
     * desativa headers antigos do padrão antigo do express-rate-limit.
     */
    legacyHeaders: false,

    /**
     * Mensagem padronizada de erro ao ultrapassar o limite.
     */
    message: {
      message: 'Muitas requisições. Tente novamente em alguns minutos.',
    },

    /**
     * skipSuccessfulRequests: false
     * conta tanto sucesso quanto erro.
     *
     * Motivo:
     * evitar brute force e flood mesmo quando a resposta falha.
     */
    skipSuccessfulRequests: false,
  });

/**
 * Sentinela usada quando o body da requisição não contém um e-mail
 * válido (string).
 *
 * Motivo:
 * evitar hashear uma string vazia, que produziria uma chave previsível
 * e igual para qualquer requisição sem e-mail.
 */
const NO_EMAIL_SENTINEL = 'no-email';

/**
 * Constrói a chave de rate limit dedicada ao login, combinando o IP do
 * cliente com um hash SHA-256 do e-mail normalizado (trim + lowercase).
 *
 * Motivo:
 * - nunca armazenar e-mail ou senha em texto puro no estado do limiter
 *   (FR-006/NFR-002);
 * - normalizar o e-mail da mesma forma que `login.validator.ts`;
 * - usar `createHash('sha256')`, o mesmo primitivo já utilizado por
 *   `AuthService` para hashear tokens.
 */
export function buildLoginRateLimitKey(ip: string, rawEmail: unknown): string {
  const normalizedEmail =
    typeof rawEmail === 'string' ? rawEmail.trim().toLowerCase() : '';

  const emailHash = normalizedEmail
    ? createHash('sha256').update(normalizedEmail).digest('hex')
    : NO_EMAIL_SENTINEL;

  return `${ipKeyGenerator(ip)}:${emailHash}`;
}

/**
 * Rate limit dedicado ao login administrativo.
 *
 * Estratégia escolhida:
 * - janela de 5 minutos
 * - até 5 tentativas por chave (IP + hash do e-mail) nessa janela
 *
 * Motivo:
 * - política mais restritiva que o limitador global (15 min / 100 req),
 *   adequada para mitigar brute force contra o login do admin (FR-001,
 *   FR-002);
 * - conta tentativas com sucesso e falha (`skipSuccessfulRequests: false`),
 *   preservando o comportamento do limitador global (FR-003);
 * - mensagem genérica e estática, que não varia conforme o e-mail
 *   submetido, evitando enumeração de contas (FR-005/NFR-001).
 */
export const loginRateLimitMiddleware: RateLimitRequestHandler =
  createRateLimiter({
    windowMs: 5 * 60 * 1000,
    limit: 5,
    standardHeaders: true,
    legacyHeaders: false,
    skipSuccessfulRequests: false,
    message: {
      message: 'Muitas tentativas de login. Tente novamente mais tarde.',
    },
    keyGenerator: (request: Request) =>
      buildLoginRateLimitKey(
        request.ip ?? '',
        (request.body as { email?: unknown })?.email,
      ),
  });
