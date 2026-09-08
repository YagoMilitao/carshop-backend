# CARSHOP-126 — Implementation Plan

## Source

Specification:
`specs/CARSHOP-126/spec.md`

## Architect Verdict

READY FOR IMPLEMENTATION

## Objective

Viabilizar o fluxo completo de autenticação (login, refresh, logout)
quando o frontend Next.js é servido de uma origem diferente da do backend
(cross-origin), preservando o modelo de segurança atual — access token de
curta duração, refresh token `HttpOnly` rotativo, sessão controlada no
servidor e proteção CSRF por double-submit cookie — sem introduzir
nenhum workaround client-side que exponha o refresh token fora de um
cookie `HttpOnly`.

## Current Architecture

- `src/presentation/helpers/auth.cookies.ts` emite `refresh_token` e
  `csrf_token` com `sameSite: 'strict'` e `secure: isProduction()` (isto
  é, `false` fora de `NODE_ENV=production`).
- `SameSite=Strict` impede o navegador de reenviar o cookie em
  requisições cross-site, mesmo com `credentials: 'include'` no cliente.
- `buildCorsOptions()` em `src/infra/config/middleware.ts` já usa
  `credentials: true` e já suporta múltiplas origens via
  `getCorsOrigins()` (lista separada por vírgula).
- `assertProductionCorsOrigins()` em `src/infra/config/env.ts` já valida,
  em produção, que cada origem de `CORS_ORIGIN` seja uma URL `https://`
  absoluta e explícita (sem curinga, sem `http://`) — invariante de
  segurança já implementado e testado.
- CSRF double-submit (`csrf_token` + header `X-CSRF-Token`) não depende
  de `SameSite` e não é afetado por esta mudança.

## Proposed Solution

1. Alterar, em `setAuthCookies` e `clearAuthCookies`
   (`src/presentation/helpers/auth.cookies.ts`), o atributo `sameSite`
   de `'strict'` para `'none'` para os cookies `refresh_token` e
   `csrf_token`.
2. Tornar `secure` incondicionalmente `true` para esses dois cookies,
   sempre, independentemente de `NODE_ENV` (hoje é `isProduction()`,
   que resulta em `false` fora de produção).
3. Não alterar `src/infra/config/env.ts` nem
   `src/infra/config/middleware.ts` — `CORS_ORIGIN`/`credentials: true`
   já suportam o cenário, e `assertProductionCorsOrigins()` permanece
   como está (decisão explícita, ver Technical Decisions).
4. Atualizar o fragmento Swagger de autenticação
   (`src/infra/docs/auth.swagger.ts`) para refletir textualmente o novo
   comportamento dos cookies.
5. Atualizar documentação (`README.md` / `.env.example`) sem incluir
   valores reais.

## Technical Decisions

### Decision

Mudar `sameSite` de `'strict'` para `'none'` para `refresh_token` e
`csrf_token` em `setAuthCookies` e `clearAuthCookies`
(`src/presentation/helpers/auth.cookies.ts`).

### Reason

É a única alteração server-side viável neste repositório para viabilizar
o cenário cross-origin descrito na especificação — não há código de
frontend neste repositório para implementar um proxy/rewrite same-site.

### Alternatives Considered

- Proxy/rewrite same-site no lado do Next.js: arquiteturalmente mais
  limpa (elimina a exposição cross-site do cookie sem depender de
  `CORS_ORIGIN`/`credentials`), mas está fora do alcance físico desta
  tarefa, pois não há repositório de frontend neste projeto. Registrada
  como recomendação ao time de frontend/CARSHOP-125, não bloqueia esta
  tarefa (ver Decision 3 no parecer do architect).

### Trade-offs

Exposição cross-site do `refresh_token` aumenta ligeiramente em relação
a `Strict`; mitigada pelo CSRF double-submit e pela preservação de
`HttpOnly`.

---

### Decision

Tornar `secure` incondicionalmente `true` para `refresh_token` e
`csrf_token`, sempre, independentemente de `NODE_ENV` (hoje é
`secure: isProduction()`, ou seja, `false` fora de produção).

### Reason

Navegadores rejeitam `SameSite=None` sem `Secure`. Esse ajuste é um
reforço do atributo `Secure` (nunca um enfraquecimento), compatível com
NFR-001/AC-005 da especificação, que exige que `Secure` permaneça ativo
pelo menos em produção — aqui passa a estar ativo também fora dela.

### Alternatives Considered

Manter `secure: isProduction()` e aceitar que `SameSite=None` seja
rejeitado pelo navegador fora de produção — rejeitado, pois quebraria o
objetivo funcional da mudança (cross-origin) em qualquer ambiente que
não seja produção.

### Trade-offs

Em desenvolvimento manual com navegador real contra um backend HTTP puro
fora de `localhost`, o cookie deixa de ser gravável. Efeito colateral
aceito e documentado: `localhost` é tratado por navegadores como
contexto seguro, portanto o fluxo local via `localhost` continua
funcionando. Testes unitários (mocks) e E2E (supertest) não são afetados
por essa regra de navegador.

---

### Decision

Não alterar `buildCorsOptions()`/`getCorsOrigins()` em
`src/infra/config/middleware.ts`.

### Reason

`credentials: true` e suporte a múltiplas origens (lista separada por
vírgula) já existem e já são suficientes para o cenário cross-origin
descrito na especificação (NFR-005).

### Alternatives Considered

Nenhuma alternativa relevante — nenhuma lacuna funcional foi
identificada nesse componente.

### Trade-offs

Nenhum.

---

### Decision

Não alterar `assertProductionCorsOrigins()` em
`src/infra/config/env.ts`.

### Reason

É um invariante de segurança já implementado e testado (rejeita origem
não-HTTPS em produção). Alterá-lo estaria fora do escopo desta
especificação e conflitaria com a task CARSHOP-125, que decide o valor
real de `CORS_ORIGIN` em produção.

### Alternatives Considered

Relaxar a validação HTTPS-only para permitir `http://localhost:3000`
contra produção — rejeitado explicitamente, por enfraquecer um invariante
de segurança já validado e por invadir o escopo da CARSHOP-125.

### Trade-offs

Consequência prática registrada como risco/observação (não bloqueio):
"frontend local (`http://localhost:3000`) chamando diretamente backend
de produção no Render" continua estruturalmente impedido pela validação
HTTPS-only de `CORS_ORIGIN` em produção — limite pré-existente, registrado
para CARSHOP-125. O caminho compatível hoje é desenvolvimento local do
frontend contra backend também local (`NODE_ENV != production`), onde
`CORS_ORIGIN=http://localhost:3000` já funciona (comprovado por teste
existente `env.spec.ts:688`).

## Execution Flow

```text
setAuthCookies() / clearAuthCookies()
    ↓
sameSite: 'strict' → 'none'   (refresh_token, csrf_token)
secure: isProduction() → true (incondicional, refresh_token, csrf_token)
    ↓
CORS (buildCorsOptions/getCorsOrigins) — inalterado, já suporta credentials:true
    ↓
assertProductionCorsOrigins() — inalterado (invariante HTTPS-only preservado)
    ↓
Swagger (auth.swagger.ts) atualizado para refletir SameSite=None; Secure sempre
    ↓
README.md / .env.example atualizados (documental, sem valores reais)
```

## Files

### Files to Create

Nenhum arquivo novo.

### Files to Modify

- `src/presentation/helpers/auth.cookies.ts`: em `setAuthCookies` e
  `clearAuthCookies`, trocar `sameSite` de `'strict'` para `'none'`;
  trocar `secure` de `isProduction()` para `true` incondicional para
  `refresh_token` e `csrf_token`, com comentário explicando que
  `SameSite=None` exige `Secure` por especificação do navegador,
  independentemente de `NODE_ENV`. Não alterar `path: '/auth'` nem
  `maxAge`.
- `test/unit/presentation/helpers/auth.cookies.spec.ts`: atualizar
  asserções que esperam `sameSite: 'strict'` e `secure: false` (cenário
  sem `NODE_ENV=production`) para `sameSite: 'none'` e `secure: true` em
  todos os cenários, incluindo defaults sem `NODE_ENV`. Adicionar teste
  explícito verificando `secure: true` mesmo fora de produção.
- `src/infra/docs/auth.swagger.ts`: adicionar `description` nas
  operações de `/auth/login`, `/auth/refresh`, `/auth/logout`
  documentando textualmente `HttpOnly` (`refresh_token`), `Secure`
  (ambos, sempre), `SameSite=None` (ambos), `Path=/auth`, e rotação de
  ambos os cookies em cada refresh bem-sucedido. Não alterar
  `authSchemas`/status codes.
- `.env.example` / `README.md`: atualização documental apenas (sem
  valores reais) — atualizar a seção de segurança/cookies do README para
  refletir `SameSite=None`; `Secure` sempre, explicando o motivo (suporte
  a frontend cross-origin) e citando `CORS_ORIGIN` como pré-requisito de
  `credentials: true`. Opcionalmente, comentário perto de `CORS_ORIGIN`
  em `.env.example` reforçando suporte a múltiplas origens HTTPS
  separadas por vírgula.

Nenhuma mudança em `src/infra/config/env.ts` nem
`src/infra/config/middleware.ts` (decisão explícita — ver Technical
Decisions).

## Contract Impact

Nenhuma mudança de rota, método HTTP, status code, payload ou header de
requisição/resposta. O contrato observável do cliente (nomes de cookie,
`HttpOnly`, `path`, `maxAge`) permanece o mesmo; apenas os atributos
`SameSite` e `Secure` dos cookies `refresh_token`/`csrf_token` mudam de
valor.

## Persistence Impact

Nenhum. Nenhuma mudança em schema, model ou repositório.

## Security Impact

- `HttpOnly`, `path` e `maxAge` do `refresh_token` permanecem inalterados
  (NFR-001).
- `Secure` passa a ser incondicionalmente `true` para `refresh_token` e
  `csrf_token` — reforço, nunca enfraquecimento, do atributo (NFR-001,
  AC-005).
- `SameSite` muda de `Strict` para `None`, decisão deliberada e única
  viável neste repositório para o cenário cross-origin; mitigada pela
  obrigatoriedade de `Secure` e pela proteção CSRF double-submit
  preservada (NFR-002).
- CSRF double-submit (`csrf_token` + header `X-CSRF-Token`) não é
  alterado, removido nem enfraquecido.
- Nenhum caminho novo expõe o refresh token fora do cookie `HttpOnly`
  (NFR-003, FR-007).
- `assertProductionCorsOrigins()` permanece intocado — invariante
  HTTPS-only em produção preservado.

## Swagger Impact

Atualizar `src/infra/docs/auth.swagger.ts` para `/auth/login`,
`/auth/refresh` e `/auth/logout`, documentando na `description` das
operações: `HttpOnly` (`refresh_token`), `Secure` (ambos os cookies,
sempre), `SameSite=None` (ambos), `Path=/auth`, e rotação de
`refresh_token`/`csrf_token` a cada refresh bem-sucedido. Não alterar
`authSchemas` nem status codes documentados (FR-009, AC-006).

## Testing Strategy

`auth.cookies.ts` já tem cobertura próxima de 100%; a mudança de valores
literais (`sameSite`, `secure`) é plenamente coberta pelos testes
unitários atualizados em
`test/unit/presentation/helpers/auth.cookies.spec.ts`. A meta `>= 80%`
de cobertura de código novo/alterado, conforme
`.claude/rules/testing.md`, é plenamente atingível sem necessidade de
exceção para o código com lógica real.

`src/infra/docs/auth.swagger.ts` é dado estático, sem lógica
condicional — caso o lcov não capture essa parte puramente textual,
aplica-se a exceção **"Not applicable"** de `.claude/rules/testing.md`
(schema/fragmento sem lógica de negócio), sem risco residual.

### Testes a criar/atualizar

Unitários (`test/unit/presentation/helpers/auth.cookies.spec.ts`):
atualizar todas as expectativas de `sameSite`/`secure` conforme a
decisão de arquitetura acima; cobrir o happy path de `setAuthCookies` e
`clearAuthCookies`.

E2E (`test/e2e/security-cors-policy.e2e-spec.ts` e/ou novo arquivo
dedicado, seguindo o padrão de nomeação existente):

- AC-001: `POST /auth/refresh` com `Origin` de teste diferente do
  backend (ex.: `https://allowed.e2e.test`), `CORS_ORIGIN` configurado
  para essa origem, cookies válidos e `X-CSRF-Token` correspondente =>
  `200`, novo `accessToken`, novos `Set-Cookie` para
  `refresh_token`/`csrf_token` (rotação), com asserção nos atributos do
  `Set-Cookie` (`SameSite=None`, `Secure`, `HttpOnly` para
  `refresh_token`).
- AC-002: mesmo cenário para `POST /auth/logout`, verificando que um
  refresh subsequente com a sessão revogada falha.
- AC-003: `X-CSRF-Token` incorreto em cenário cross-origin => `403`,
  sem alterar estado.
- AC-004: cookie `refresh_token` ausente => `401` (cross-origin e
  same-origin).
- AC-007: revisão manual garantindo que nenhum teste loga ou expõe o
  valor do refresh token fora do cookie.

Testes de aceite (AC-001/AC-002) devem simular "origem diferente do
backend" com uma origem HTTPS de teste (seguindo o padrão já existente em
`security-cors-policy.e2e-spec.ts`, que usa `https://allowed.e2e.test`),
não literalmente `localhost:3000` contra produção.

## Risks

1. O cenário "frontend local vs. backend de produção no Render" continua
   impedido pela validação HTTPS-only de `CORS_ORIGIN` em produção —
   registrado para CARSHOP-125, não é pendência desta tarefa.
2. `secure: true` incondicional depende da exceção de navegador para
   `localhost` em desenvolvimento manual — comportamento de navegador,
   fora do controle do repositório.
3. Exposição cross-site do `refresh_token` aumenta ligeiramente em
   relação a `Strict`; mitigada pelo CSRF double-submit e por `HttpOnly`
   preservado.

## Implementation Steps

1. Em `src/presentation/helpers/auth.cookies.ts`, em `setAuthCookies` e
   `clearAuthCookies`, trocar `sameSite: 'strict'` por
   `sameSite: 'none'` e `secure: isProduction()` por `secure: true`
   (incondicional) para `refresh_token` e `csrf_token`, preservando
   `path: '/auth'`, `maxAge` e `HttpOnly`. Adicionar comentário
   explicando a exigência de `Secure` do navegador para `SameSite=None`.
2. Atualizar `test/unit/presentation/helpers/auth.cookies.spec.ts` para
   refletir `sameSite: 'none'`/`secure: true` em todos os cenários,
   incluindo um teste explícito de `secure: true` fora de produção.
3. Atualizar `src/infra/docs/auth.swagger.ts` com as descrições dos
   atributos de cookie para `/auth/login`, `/auth/refresh` e
   `/auth/logout`.
4. Adicionar/atualizar testes E2E cross-origin em
   `test/e2e/security-cors-policy.e2e-spec.ts` (ou arquivo dedicado)
   cobrindo AC-001 a AC-004 e AC-007.
5. Atualizar `README.md`/`.env.example` (apenas texto/documentação, sem
   valores reais).
6. Rodar `npm test`, `npm run test:coverage`, `npm run test:e2e` e
   `npm run build`.

## Definition of Done Mapping

- FR-001, FR-002, FR-008 (login → refresh → logout cross-origin,
  incluindo rotação) → satisfeitos por `SameSite=None; Secure` em
  `auth.cookies.ts` e pelos testes E2E dos AC-001/AC-002.
- FR-003 (erro explícito quando `refresh_token` ausente) → comportamento
  preexistente, preservado e coberto por AC-004.
- FR-004, FR-005 (CSRF double-submit obrigatório e rejeição de token
  incorreto) → preservados sem alteração de código; cobertos por
  AC-001/AC-002/AC-003.
- FR-006, FR-007, NFR-003 (`HttpOnly` preservado; nenhuma exposição do
  refresh token fora do cookie) → satisfeitos por não alterar `HttpOnly`
  e por não introduzir nenhum caminho client-side de exposição; cobertos
  por AC-005/AC-007.
- FR-009, AC-006 (Swagger reflete `SameSite` real) → satisfeito pela
  atualização de `src/infra/docs/auth.swagger.ts`.
- NFR-001, AC-005 (`HttpOnly`/`path`/`maxAge` preservados; `Secure`
  ativo) → satisfeito; `Secure` passa a ser incondicional (reforço).
- NFR-002 (CSRF não enfraquecido) → satisfeito; nenhuma mudança no
  mecanismo double-submit.
- NFR-004 (same-origin sem regressão) → satisfeito; `SameSite=None` com
  `Secure` continua funcional para same-origin em contexto seguro.
- NFR-005 (dependência com `CORS_ORIGIN`/`credentials` documentada) →
  satisfeito pela documentação em README/.env.example e pelo registro
  explícito de que `credentials: true` já existe em
  `buildCorsOptions()`.
- AC-008 (veredito explícito do architect com trade-offs avaliados) →
  satisfeito por este plano, que registra a avaliação de
  `SameSite=None; Secure` versus proxy/rewrite no frontend (Decision 1,
  Alternatives Considered).

## Open Non-Blocking Questions

(Herdadas de `specs/CARSHOP-126/spec.md`, resolvidas pelas decisões de
arquitetura acima, registradas aqui para rastreabilidade)

- Qual mecanismo concreto viabiliza o cenário cross-origin — resolvido:
  `SameSite=None; Secure` em `auth.cookies.ts`; proxy/rewrite no Next.js
  avaliado e registrado como recomendação não adotada nesta tarefa (fora
  do alcance físico deste repositório).
- Dependência com valor real de `CORS_ORIGIN` — permanece fora do escopo
  desta especificação e de qualquer artefato versionado; tratada pela
  CARSHOP-125.
