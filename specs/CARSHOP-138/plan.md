# CARSHOP-138 — Implementation Plan

## Source

Specification:
`specs/CARSHOP-138/spec.md`

## Architect Verdict

READY FOR IMPLEMENTATION

Justificativa: a auditoria do código real não encontrou nenhuma rota
`/admin/*` desprotegida, nenhum enfraquecimento de cookie/CSRF, e nenhum
vazamento de token sensível. Os únicos gaps reais e confirmados são de
cobertura de teste automatizado (AC-001 e AC-002), totalmente fecháveis
com testes E2E adicionais seguindo os padrões já existentes no
repositório, sem exigir nenhuma decisão arquitetural nova, mudança de
contrato ou de comportamento de segurança.

## Objective

Confirmar, por meio de auditoria do código atual e reforço pontual onde
necessário, que:

1. Todo endpoint administrativo deste repositório permanece protegido no
   backend por autenticação e validação de sessão server-side,
   independentemente de qualquer verificação client-side.
2. O contrato de sessão, refresh, CSRF e cookies já existente continua
   íntegro, sem enfraquecimento.
3. Ausência ou expiração de sessão nunca resulta em exposição de dado ou
   ação administrativa.
4. Nenhum token sensível é persistido em `localStorage` por qualquer
   artefato deste repositório.
5. O gap de cobertura de teste para os cenários "acesso não autenticado"
   e "sessão expirada/inválida" nos endpoints administrativos é
   identificado e fechado.

## Current Architecture

Auditoria do estado real do código, conforme apurado pelo architect:

- `authMiddleware` já protege todas as 6 rotas mutantes sob `/admin/*`.
- Cookies (`refresh_token`, `csrf_token`) definidos incondicionalmente
  (não derivados de `NODE_ENV`) em
  `src/presentation/helpers/auth.cookies.ts`, em conformidade com
  ADR-016 e CARSHOP-126.
- CSRF double-submit (`csrf-protection.middleware.ts` +
  `AuthService.validateRefreshRequest`/`safeEquals`) intacto e coberto
  por `test/e2e/security-csrf-protection.e2e-spec.ts` (4 casos).
- `errorHandlerMiddleware` (4 parâmetros, fix CARSHOP-104 confirmado em
  vigor) nunca inclui stack trace, `req.auth`, session id ou cookie na
  resposta.
- `AuthController` nunca inclui `refreshToken` no corpo de
  login/refresh; refresh token só trafega via cookie `HttpOnly`.
- Nenhuma ocorrência de `localStorage`/`sessionStorage` em `src/`.
- `GET /works` usa `requireAuthForDraftsMiddleware`, delegando para
  `authMiddleware` apenas quando `includeDrafts=true` — gate condicional
  de CARSHOP-102 permanece em vigor.

## Proposed Solution

Nenhuma mudança em `src/**` é necessária. A solução consiste
exclusivamente em adicionar testes E2E que comprovem os dois gaps de
cobertura identificados pela auditoria, seguindo os padrões já
existentes no repositório (login via `/auth/login`, revogação de sessão
via `AuthSessionModel.findOneAndUpdate({ id }, { revokedAt: Date.now() })`,
como já faz `security-token-session-authorization.e2e-spec.ts`).

### Auditoria de rotas administrativas (FR-009/AC-006)

Todas as 6 rotas mutantes sob `/admin/*` foram inspecionadas diretamente
no código-fonte:

- `admin-comment.routes.ts`: `PATCH /admin/comments/:commentId/approve`
  — `authMiddleware` via `router.use` (linha 38)
- `admin-comment.routes.ts`: `PATCH /admin/comments/:commentId` —
  `authMiddleware` via `router.use` (linha 41)
- `admin-comment.routes.ts`: `DELETE /admin/comments/:commentId` —
  `authMiddleware` via `router.use` (linha 42)
- `admin-work.routes.ts`: `DELETE /admin/works/:workId` —
  `authMiddleware` inline (linha 31)
- `work-image.routes.ts`: `POST /admin/works/:workId/images` —
  `authMiddleware` inline, antes de `uploadMiddleware` (linhas 96-103)
- `work-image.routes.ts`: `DELETE /admin/works/:workId/images/:imageId`
  — `authMiddleware` inline (linha 105)

Nenhum gap de produção encontrado.

### Gaps reais encontrados — cobertura de teste (NFR-005)

- Gap 1 (AC-001): `PATCH /admin/comments/:commentId` (update, distinto
  de approve) não tem hoje teste E2E que comprove `401` + nenhuma
  mutação sem `Authorization`. Rotas irmãs (approve, delete) já têm
  essa cobertura.
- Gap 2 (AC-002): Nenhuma rota `/admin/*` tem hoje teste que comprove
  `401` para sessão revogada em `SessionStorePort`. O cenário
  equivalente só existe para `GET /auth/session` (não é rota
  `/admin/*`). A spec exige pelo menos uma rota representativa por
  route builder administrativo (`admin-comment.routes.ts`,
  `admin-work.routes.ts`, `work-image.routes.ts`) — hoje zero rotas
  admin cobrem isso.

Nenhum gap é comportamento incorreto em produção: `auth.middleware.ts`
já consulta `sessionStore.isActive(payload.sid)` antes de liberar
qualquer rota. Só falta a prova automatizada.

## Technical Decisions

### Decision

Não realizar nenhuma alteração em `src/**`; a solução se limita a
adicionar testes E2E que fecham os gaps de cobertura identificados
(Gap 1/AC-001 e Gap 2/AC-002).

### Reason

A auditoria de código não encontrou nenhum comportamento incorreto em
produção — `authMiddleware` já protege todas as rotas administrativas e
`sessionStore.isActive` já é consultado antes de liberar qualquer rota.
Os únicos gaps são de comprovação automatizada, não de comportamento.

### Alternatives Considered

Nenhuma alteração de código de produção foi cogitada, pois nenhum gap
de comportamento foi encontrado.

### Trade-offs

Nenhum. Abordagem minimalista e de baixo risco, sem impacto em
contrato, persistência ou segurança.

---

### Decision

Fechar o Gap 1 (AC-001) estendendo
`test/e2e/admin-comment-update-security.e2e-spec.ts` com um caso:
`PATCH /admin/comments/:commentId` sem header `Authorization` → `401`,
comprovando via `findApprovedComment` que `content` não mudou.

### Reason

Rota irmã já coberta pelo mesmo padrão de teste; falta apenas o caso do
verbo de update.

### Alternatives Considered

Criar um arquivo de teste novo dedicado — descartado por duplicar
boilerplate desnecessariamente, já existindo arquivo "dono" da rota.

### Trade-offs

Nenhum trade-off relevante.

---

### Decision

Fechar o Gap 2 (AC-002) com sessão revogada por route builder
administrativo. Opção recomendada (A): estender os três arquivos de
teste já existentes e "donos" de cada route builder:

- `admin-comment-hard-delete.e2e-spec.ts` → adicionar caso: login,
  revogar sessão via `AuthSessionModel`, tentar
  `DELETE /admin/comments/:commentId` com access token antigo → `401`,
  comentário não removido.
- `admin-work-hard-delete.e2e-spec.ts` → mesmo padrão para
  `DELETE /admin/works/:workId` → `401`, work não removido.
- `work-image-upload.e2e-spec.ts` → mesmo padrão para
  `POST /admin/works/:workId/images` (ou
  `DELETE .../images/:imageId`) → `401`, `uploadSpy`/`deleteSpy` do
  `imageStorage` não chamado.

Opção B (alternativa aceitável, mais boilerplate): um único arquivo
novo `test/e2e/admin-routes-session-revocation.e2e-spec.ts` cobrindo as
3 rotas em um único `describe`.

A escolha entre A e B é decisão de implementação do developer, desde
que a rastreabilidade FR-004/AC-002/NFR-005 seja mantida em
comentários (padrão: `// CARSHOP-138 — FR-004/AC-002: ...`).

### Reason

Reutiliza arquivos de teste já "donos" da rota respectiva, mantendo
coesão e evitando duplicação de setup.

### Alternatives Considered

Opção B (arquivo único consolidado) foi registrada como alternativa
aceitável pelo architect, delegada à decisão do developer.

### Trade-offs

Opção A: menos boilerplate, mas espalha a cobertura de revogação de
sessão em três arquivos distintos. Opção B: centraliza o cenário, mas
com mais boilerplate de setup repetido.

## Execution Flow

1. Estender `test/e2e/admin-comment-update-security.e2e-spec.ts` com o
   caso do Gap 1 (AC-001).
2. Estender (Opção A) ou criar (Opção B) os testes do Gap 2 (AC-002)
   para as três rotas administrativas representativas.
3. Rodar `npm run test:e2e`.
4. Confirmar via `git diff` que nenhum arquivo em `src/` foi alterado.
5. Reportar a auditoria de rotas (FR-009/AC-006) de forma explícita no
   resumo de implementação.

## Files

### Files to Create

Nenhum, caso o developer opte pela Opção A (extensão de arquivos
existentes).

Caso opte pela Opção B: `test/e2e/admin-routes-session-revocation.e2e-spec.ts`
(alternativa aceitável, decisão do developer).

### Files to Modify

| Arquivo | Responsabilidade da mudança |
|---|---|
| `test/e2e/admin-comment-update-security.e2e-spec.ts` | Adicionar caso "sem Authorization → 401, sem mutação" para `PATCH /admin/comments/:commentId` |
| `test/e2e/admin-comment-hard-delete.e2e-spec.ts` | Adicionar caso "sessão revogada → 401, sem exclusão" para `DELETE /admin/comments/:commentId` |
| `test/e2e/admin-work-hard-delete.e2e-spec.ts` | Adicionar caso "sessão revogada → 401, sem exclusão" para `DELETE /admin/works/:workId` |
| `test/e2e/work-image-upload.e2e-spec.ts` | Adicionar caso "sessão revogada → 401, sem chamada ao imageStorage" para uma rota de `/admin/works/:workId/images*` |

Nenhum arquivo em `src/` precisa mudar. Nenhum novo port, use case,
controller, middleware, schema Mongoose ou fragmento Swagger é
necessário.

## Contract Impact

Nenhuma mudança de contrato. Comportamento observável documentado
permanece exatamente como está.

## Persistence Impact

Nenhuma mudança de modelo de dados ou persistência.

## Security Impact

- Risco de regressão: nenhum (sem mudança de código de produção).
- Compatibilidade (NFR-004): preservada.
- Segurança: reforça evidência de que a arquitetura de auth já é
  robusta; risco residual é apenas "cobertura de teste ainda não
  comprovada" até implementação dos testes propostos.
- Fora de escopo confirmado: nenhuma alteração toca o boundary
  Next.js; nenhuma alteração reabre `SameSite`/`Secure` de CARSHOP-126.

## Swagger Impact

Nenhuma mudança em Swagger é necessária — contrato HTTP observável já
documentado corretamente e não muda.

## Testing Strategy

Esta tarefa não introduz código de produção novo ou alterado — apenas
testes E2E. A política de cobertura `>=80%` aplica-se a `src/**/*.ts`;
como nenhum arquivo em `src/` é criado ou modificado, não há código de
produção sujeito à métrica nesta tarefa (exceção justificada "Not
applicable": sem diff em `src/`). O developer/tester deve confirmar
isso rodando `git diff` ao final, provando que nenhum arquivo de
produção foi tocado.

Validação exigida:

- `npm run test:e2e` (obrigatório).
- Cada novo teste deve mapear explicitamente para
  AC-001/AC-002/FR-001–FR-004 em comentário (padrão:
  `// CARSHOP-138 — FR-004/AC-002: ...`).
- Nenhum teste deve expor token real fora do mecanismo já existente
  (AC-007) — apenas tokens gerados no próprio teste.

## Risks

- Encontrar, durante a auditoria, uma rota administrativa que não usa
  `authMiddleware` — não ocorreu; a auditoria confirmou que todas as 6
  rotas já estão protegidas.
- Duplicar autorização apenas no frontend por engano, criando falsa
  sensação de segurança sem que o backend continue sendo a autoridade
  final — vetado explicitamente pela task original e fora do escopo
  deste repositório.
- Reabrir a decisão de `SameSite`/`Secure` de CARSHOP-126 sem evidência
  concreta, introduzindo regressão no fluxo cross-origin já resolvido
  — não há evidência de regressão; decisão não reaberta.
- Escopo cruzar acidentalmente para o repositório do frontend Next.js
  durante a implementação, violando o Scope Boundary da especificação.

## Implementation Steps

1. Ler e confirmar o estado atual dos arquivos de teste E2E listados em
   "Files to Modify".
2. Implementar o caso do Gap 1 (AC-001) em
   `admin-comment-update-security.e2e-spec.ts`.
3. Implementar os casos do Gap 2 (AC-002) para as três rotas
   representativas (Opção A ou B, à escolha do developer).
4. Rodar `npm run test:e2e` e confirmar que todos os testes passam.
5. Rodar `git diff` e confirmar que nenhum arquivo em `src/` foi
   alterado.
6. Reportar explicitamente a auditoria de rotas (FR-009/AC-006) no
   resumo de implementação.

## Definition of Done Mapping

| Requisito | Cobertura |
|---|---|
| FR-001, FR-002, FR-003, FR-004, FR-008 | Já garantidos pelo `authMiddleware`/`SessionStorePort` existentes; comprovados pelos testes E2E novos/estendidos (AC-001, AC-002) |
| FR-005, NFR-002 | Já cobertos por `security-csrf-protection.e2e-spec.ts` (AC-003); nenhuma ação necessária |
| FR-006, NFR-001 | Já garantidos por `auth.cookies.ts`; confirmados por inspeção (AC-004); nenhuma ação necessária |
| FR-007, NFR-003 | Já garantidos pelo `AuthController`/ausência de `localStorage` em `src/`; confirmados por auditoria (AC-005, AC-007) |
| FR-009, NFR-005 | Auditoria de rotas documentada neste plano (AC-006); gaps de teste fechados pelos passos de implementação |

## Open Non-Blocking Questions

- O conteúdo exato e o estado atual de CARSHOP-2, CARSHOP-29 e
  CARSHOP-30 não puderam ser confirmados a partir de `specs/` neste
  repositório (não possuem `spec.md`/`plan.md` versionados aqui);
  qualquer achado relevante dessas tasks deve ser levantado a partir
  do Notion ou do estado atual do código, não assumido.
