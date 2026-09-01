/**
 * Deterministic clock control for the CARSHOP-111 security-controls E2E
 * suite (FR-017: time-dependent scenarios must not rely on real
 * wall-clock waiting).
 *
 * Motivo:
 * extrai o padrão de `jest.useFakeTimers`/`jest.setSystemTime` já
 * comprovado em `auth-login-rate-limit.e2e-spec.ts` (CARSHOP-108) para
 * um helper reutilizável, preservando exatamente o mesmo comportamento:
 * congela apenas `Date`/`performance`, mantendo `setTimeout`/
 * `setInterval`/sockets reais para não interferir com o `supertest`.
 */

const FAKE_TIMERS_DO_NOT_FAKE: Array<
  | 'hrtime'
  | 'nextTick'
  | 'performance'
  | 'queueMicrotask'
  | 'requestAnimationFrame'
  | 'cancelAnimationFrame'
  | 'requestIdleCallback'
  | 'cancelIdleCallback'
  | 'setImmediate'
  | 'clearImmediate'
  | 'setInterval'
  | 'clearInterval'
  | 'setTimeout'
  | 'clearTimeout'
> = [
  'hrtime',
  'nextTick',
  'performance',
  'queueMicrotask',
  'requestAnimationFrame',
  'cancelAnimationFrame',
  'requestIdleCallback',
  'cancelIdleCallback',
  'setImmediate',
  'clearImmediate',
  'setInterval',
  'clearInterval',
  'setTimeout',
  'clearTimeout',
];

/**
 * Instala fake timers e avança o relógio simulado até `targetEpochMs`,
 * preservando `setTimeout`/`setInterval` reais (necessário para que o
 * `supertest` continue completando requisições HTTP normalmente).
 *
 * Uso esperado: chamar em um cenário isolado e restaurar com
 * `jest.useRealTimers()` em `afterEach`.
 */
export function advanceSystemTimeTo(targetEpochMs: number): void {
  jest.useFakeTimers({ doNotFake: FAKE_TIMERS_DO_NOT_FAKE });
  jest.setSystemTime(targetEpochMs);
}
