import rateLimit, { type RateLimitRequestHandler } from 'express-rate-limit';

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
