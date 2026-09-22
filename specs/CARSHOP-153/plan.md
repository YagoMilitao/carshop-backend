# CARSHOP-153 — Implementation Plan

## Source

Specification:
`specs/CARSHOP-153/spec.md`

## Architect Verdict

READY FOR IMPLEMENTATION

## Objective

Corrigir o atributo `Path` dos cookies `refresh_token` e `csrf_token`, hoje
fixado em `/auth` em `src/presentation/helpers/auth.cookies.ts`, para que o
browser também anexe esses cookies em navegações/requisições para
`/admin/*`, sem alterar `HttpOnly`, `Secure`, `SameSite=None`, nomes dos
cookies, formato de resposta ou status codes (FR-001..FR-006,
NFR-001..003, AC-001).

## Current Architecture

- `src/presentation/helpers/auth.cookies.ts` é o único lugar do código de
  produção com `path: '/auth'` (4 ocorrências: `refresh_token`/`csrf_token`
  em `setAuthCookies`, e as mesmas em `clearAuthCookies`).
- `src/infra/config/routes.ts` — prefixos montados: `/auth`, `/works`,
  `/admin/comments`, `/admin/works`. Não existe prefixo comum a `/auth` e
  `/admin` além da raiz `/`.
- `src/infra/presentation/middleware/auth.middleware.ts` autentica
  exclusivamente via header `Authorization: Bearer <token>`, nunca lê
  cookies. Rotas `/admin/*` deste backend não dependem do cookie chegar
  para autenticação de API — o problema é o cookie não chegar para
  verificação de sessão do frontend (fora de escopo).
- `csrf-protection.middleware.ts` e `auth.controller.ts` (refresh, logout)
  leem `csrf_token`/`refresh_token` via `parseCookies(request.headers.cookie)`,
  não via `request.cookie` do Express — o `path` não afeta a leitura
  server-side. Ampliar o path não quebra `/auth/refresh` nem
  `/auth/logout`.
- `src/infra/docs/auth.swagger.ts` não documenta o atributo `path` do
  cookie. Nenhuma alteração de Swagger é necessária.
- `test/unit/presentation/helpers/auth.cookies.spec.ts` tem 4 asserções
  `objectContaining({ path: '/auth' })` (linhas 42, 54, 198, 208) que
  precisam ser atualizadas.

## Proposed Solution

Alterar o valor literal do atributo `path` dos cookies `refresh_token` e
`csrf_token`, tanto em `setAuthCookies` quanto em `clearAuthCookies`, de
`/auth` para `/`, mantendo simetria entre set e clear (FR-002) e todos os
demais atributos (`httpOnly`, `secure`, `sameSite`, `maxAge`) inalterados.

## Technical Decisions

### Decision

Valor escolhido para o atributo `Path`: `path: '/'` (raiz do domínio),
aplicado igualmente em `setAuthCookies` (ambos os cookies) e
`clearAuthCookies` (ambos os cookies).

### Reason

- Não há como declarar "`/auth` OU `/admin`" em um único `Set-Cookie`
  (RFC 6265, um único `Path` por cookie).
- `/auth` e `/admin` não têm ancestral comum mais específico que `/`.
  Logo, `/` é o único valor que satisfaz FR-001 sem inventar sintaxe
  inexistente no RFC.
- `/` é o próprio default do Express quando `path` é omitido — não
  introduz padrão exótico.

### Alternatives Considered

- Manter `/auth` e adicionar um path explícito adicional cobrindo
  `/admin` — rejeitado: RFC 6265 permite apenas um `Path` por cookie, não
  é possível declarar dois paths no mesmo `Set-Cookie`.
- Escolher um path intermediário customizado — rejeitado: `/auth` e
  `/admin` não compartilham nenhum prefixo comum além de `/`, então
  qualquer valor que não seja `/` deixaria de cobrir um dos dois grupos
  de rotas.

### Trade-offs

- Cookie passará a ser tecnicamente enviado também em `/works` e
  `/health`. Não amplia superfície de ataque materialmente porque: (a)
  `refresh_token` continua `HttpOnly`; (b) validação CSRF double-submit
  só se aplica em `/auth/refresh` e `/auth/logout`; (c) `Secure` e
  `SameSite=None` permanecem inalterados. Único efeito observável é o
  cookie estar presente no header `Cookie` em mais requisições — o
  backend não passa a confiar nele em mais lugares (NFR-001).

## Execution Flow

1. Atualizar `src/presentation/helpers/auth.cookies.ts` (`setAuthCookies`
   e `clearAuthCookies`) trocando `path: '/auth'` por `path: '/'` nas 4
   ocorrências, e atualizar os comentários JSDoc relacionados.
2. Atualizar `test/unit/presentation/helpers/auth.cookies.spec.ts` (4
   asserções existentes + novo teste de regressão).
3. Ler e, se necessário, atualizar
   `test/unit/presentation/controllers/auth.controller.spec.ts` caso haja
   asserção sobre `path` do cookie.
4. Rodar suíte de testes unitários, build e e2e conforme "Testing
   Strategy" abaixo.

## Files

### Files to Create

Nenhum.

### Files to Modify

1. `src/presentation/helpers/auth.cookies.ts`
   - `setAuthCookies`: `path: '/auth'` → `path: '/'` nas duas chamadas
     `response.cookie` (`refresh_token` e `csrf_token`).
   - `clearAuthCookies`: `path: '/auth'` → `path: '/'` nas duas chamadas
     `response.clearCookie`.
   - Atualizar o comentário JSDoc acima de `setAuthCookies` (~linhas
     30-39) e o comentário próximo ao bloco `secure`/`sameSite` em
     `clearAuthCookies`, registrando por que o path foi ampliado para `/`
     (referenciar CARSHOP-153 objetivamente, seguindo o padrão dos
     comentários existentes sobre `SameSite=None`, linhas 45-48, 74-76).
   - Não tocar em `httpOnly`, `secure`, `sameSite`, `maxAge`, nomes de
     cookie, `parseCookies`.

2. `test/unit/presentation/helpers/auth.cookies.spec.ts`
   - Atualizar as 4 asserções `path: '/auth'` (linhas 42, 54, 198, 208)
     para `path: '/'`.
   - Adicionar teste de regressão explícito (NFR-003 / regra de bug fix
     precisa de teste que falha sem o fix) cobrindo `setAuthCookies` e
     `clearAuthCookies`, comentando `// AC-001` / referência a
     CARSHOP-153.
   - Confirmar que nenhuma outra asserção (`httpOnly`, `secure`,
     `sameSite`, `maxAge`) foi alterada.

3. `test/unit/presentation/controllers/auth.controller.spec.ts`
   (verificar durante implementação)
   - Ler antes de implementar; atualizar apenas se houver asserção sobre
     `path` do cookie.

Nenhuma mudança em: `src/infra/config/routes.ts`, fragmentos Swagger,
`auth.middleware.ts`, `csrf-protection.middleware.ts`,
`auth.controller.ts` (produção).

## Contract Impact

- Sem mudança de contrato HTTP (mesmos status codes, corpo, nomes de
  cookie, headers).
- Único efeito observável: o `Set-Cookie` de `refresh_token`/`csrf_token`
  passa a declarar `Path=/` em vez de `Path=/auth`, em `POST /auth/login`,
  `POST /auth/refresh` (set) e `POST /auth/logout` (clear).

## Persistence Impact

Nenhum modelo de persistência afetado.

## Security Impact

- Risco de segurança mitigado conforme trade-off descrito em "Technical
  Decisions" acima: `HttpOnly`, `Secure` e `SameSite=None` permanecem
  inalterados; a validação CSRF double-submit continua restrita a
  `/auth/refresh` e `/auth/logout`.
- Compatibilidade: cookies antigos com `Path=/auth` expiram por `maxAge`
  ou são sobrescritos no próximo login/refresh; `clearAuthCookies` usa o
  mesmo path do `setAuthCookies` atual (simetria mantida). Sem
  necessidade de migração ativa.
- Fora de escopo: mudanças no frontend Next.js.

## Swagger Impact

Nenhuma. `src/infra/docs/auth.swagger.ts` não documenta o atributo `path`
do cookie, portanto nenhuma alteração de fragmento OpenAPI é necessária.

## Testing Strategy

- Mudança de 4 linhas de valor literal em funções já 100% cobertas pelos
  testes existentes.
- Atualizar as 4 asserções existentes + adicionar 1-2 casos de regressão
  nomeando CARSHOP-153/AC-001.
- Cobertura de linha/branch do código alterado permanece 100% — acima do
  piso de `>= 80%` definido em `.claude/rules/testing.md`. Sem
  necessidade de exceção justificada.
- Revisar (não necessariamente alterar)
  `test/unit/presentation/controllers/auth.controller.spec.ts`.
- Comandos:
  - `npx jest test/unit/presentation/helpers/auth.cookies.spec.ts`
  - `npx jest test/unit/presentation/controllers/auth.controller.spec.ts`
  - `npm test`
  - `npm run build`
  - `npm run test:e2e` (verificar se há asserção de path em e2e de
    login/refresh/logout e atualizar se houver).

## Risks

- Ambos os cookies carregam responsabilidades de autenticação
  (`refresh_token`) e CSRF double-submit (`csrf_token`). Ampliar `Path`
  aumenta o conjunto de rotas onde o cookie é automaticamente anexado
  pelo browser, o que foi avaliado quanto a exposição não intencional
  além do operacionalmente necessário (ver Security Impact).
- O bug foi reproduzido contra um backend real deployado em dois
  browsers; um fix validado apenas por testes unitários isolados pode
  não confirmar totalmente o comportamento observável no browser. Um
  teste unitário é a validação mínima exigida pela Definition of Done;
  validação mais ampla equivalente (ex.: cobertura e2e dos atributos do
  cookie) é esperada conforme as convenções de teste do projeto para
  mudanças em cookies/autenticação.

## Implementation Steps

1. Atualizar `src/presentation/helpers/auth.cookies.ts` conforme "Files to
   Modify" item 1.
2. Atualizar `test/unit/presentation/helpers/auth.cookies.spec.ts`
   conforme item 2.
3. Ler `test/unit/presentation/controllers/auth.controller.spec.ts` e
   atualizar apenas se necessário (item 3).
4. Rodar `npx jest test/unit/presentation/helpers/auth.cookies.spec.ts`.
5. Rodar `npx jest test/unit/presentation/controllers/auth.controller.spec.ts`.
6. Rodar `npm test`.
7. Rodar `npm run build`.
8. Rodar `npm run test:e2e` e atualizar asserções de path em e2e de
   login/refresh/logout, se existirem.

## Definition of Done Mapping

- FR-001 → Item 1 de "Files to Modify" (`setAuthCookies` com `path: '/'`).
- FR-002 → Item 1 de "Files to Modify" (`clearAuthCookies` com mesmo
  `path: '/'` usado no set).
- FR-003 → Nenhuma mudança em `auth.controller.ts`/leitura via
  `parseCookies`; validado por
  `test/unit/presentation/controllers/auth.controller.spec.ts` e
  `npm run test:e2e`.
- FR-004 → Idem FR-003, para `POST /auth/logout`.
- FR-005 → Nenhuma alteração em `httpOnly`, `secure`, `sameSite`,
  validado pelas asserções mantidas em
  `test/unit/presentation/helpers/auth.cookies.spec.ts`.
- FR-006 → Nenhuma alteração em `csrf-protection.middleware.ts`; validado
  por testes existentes de CSRF.
- NFR-001 → Justificativa de segurança documentada em "Technical
  Decisions"/"Security Impact".
- NFR-002 → Nenhuma mudança em nomes de cookie ou demais atributos.
- NFR-003 → Novo teste de regressão em
  `test/unit/presentation/helpers/auth.cookies.spec.ts` (AC-001).
- AC-001 → Coberto pelos testes atualizados/adicionados nos itens acima.

## Open Non-Blocking Questions

- Valor final exato do `Path` (`/` vs. um path explícito cobrindo
  `/admin` e `/auth`) foi deixado a critério do arquiteto pela
  especificação; resolvido nesta decisão como `path: '/'` (ver
  "Technical Decisions").

## Addendum — Legacy Path=/auth Cookie Cleanup (post-Done Codex review)

### Context

Após o CARSHOP-153 ter sido marcado como `Done` (commit `c1e115e`, que
alterou o path dos cookies de `/auth` para `/`), um bot externo de code
review (Codex) sinalizou duas questões na PR:

- **P1**: `Path` é parte da identidade de um cookie (RFC 6265). Browsers
  que já possuíam cookies antigos com `Path=/auth` (emitidos antes do
  fix) não são migrados automaticamente pelos novos cookies com
  `Path=/`; o resultado é a coexistência de dois cookies de mesmo nome em
  paths diferentes. O `clearAuthCookies` original limpava apenas a
  variante `Path=/`, deixando viva a variante legada `Path=/auth`
  (potencialmente com um `refresh_token` ainda válido) após o logout.
- **P2**: `src/infra/docs/auth.swagger.ts` e `docs/api-contract.md`
  continuavam descrevendo, em texto narrativo, `Path=/auth` mesmo depois
  do fix — algo que a checagem original de Swagger (um grep estrutural
  por chave) não capturou, pois as menções estavam em texto livre, não em
  uma chave `path`.

### Decision (architect-confirmed READY FOR IMPLEMENTATION)

- Tanto `setAuthCookies` quanto `clearAuthCookies` em
  `src/presentation/helpers/auth.cookies.ts` agora também chamam
  `response.clearCookie(name, { ...mesmos atributos httpOnly/secure/sameSite
  do cookie vivo, path: '/auth' })` para `refresh_token` e `csrf_token`,
  expirando ativamente a variante de path legado.
- Fazer essa limpeza em `setAuthCookies` (não apenas em
  `clearAuthCookies`) é necessário, não é excesso de zelo: nem toda
  sessão termina via logout explícito (fechamento de aba, expiração de
  sessão), então a limpeza oportunista a cada resposta de login/refresh
  garante que o cookie legado não permaneça vivo pelo `maxAge` completo
  (até 7 dias).
- Nenhum atributo `httpOnly`/`secure`/`sameSite` foi enfraquecido; apenas
  as chamadas de limpeza de migração usam `path: '/auth'`, alinhadas aos
  atributos de segurança do cookie vivo.
- `src/infra/docs/auth.swagger.ts` (descrições de login/refresh/logout) e
  `docs/api-contract.md` foram atualizados para declarar `Path=/` para o
  cookie vivo e mencionar a expiração da variante legada `Path=/auth`
  durante a migração.

### Compliance Confirmation

Não contradiz FR-002 (`clearAuthCookies` deve usar o mesmo `Path` que
`setAuthCookies` para o cookie vivo — continua verdadeiro, ambos usam
`/`), é consistente com NFR-001 (path não mais amplo que o necessário) e
com a seção "Risks" já existente em `spec.md` sobre cookies antigos.

### Files Touched (already implemented and verified by architect)

Nenhuma mudança de código adicional é necessária; os arquivos abaixo já
foram implementados e verificados pelo arquiteto:

1. `src/presentation/helpers/auth.cookies.ts`
2. `src/infra/docs/auth.swagger.ts`
3. `docs/api-contract.md`
4. `test/unit/presentation/controllers/auth.controller.spec.ts` (teste de
   logout atualizado: `clearCookie` chamado 4 vezes em vez de 2)
5. `test/unit/presentation/helpers/auth.cookies.spec.ts` (novas
   asserções para as 4 chamadas de `clearCookie` em cada função)

### Validation Plan

- `npx jest test/unit/presentation/helpers/auth.cookies.spec.ts`
- `npx jest test/unit/presentation/controllers/auth.controller.spec.ts`
- `npm test`
- `npm run build`
- `npm run test:e2e` — atenção especial: os specs e2e de login/refresh
  usam `extractCookie`, que faz
  `setCookie.find(entry => entry.startsWith('refresh_token='))`. Como
  `response.cookie` para o valor real é chamado antes de
  `response.clearCookie` para o path legado dentro de `setAuthCookies`, o
  header `Set-Cookie` do cookie real é emitido primeiro, então `.find()`
  continua retornando o cookie real correto. O arquiteto confirmou que
  nenhum spec e2e faz asserção sobre a contagem de headers `Set-Cookie`.

### Verdict

`READY FOR IMPLEMENTATION` (architect, nesta revisão de follow-up).
