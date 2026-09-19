# CARSHOP-138 — Endurecer autenticação e autorização server-side da área admin

## Status

Ready

## Source

Notion Task:
CARSHOP-138

## Context

A tarefa original é explicitamente **Fullstack** (Component: Auth, Admin
UI) e pede uma auditoria de ponta a ponta do acesso administrativo,
cobrindo tanto o boundary server-side do Next.js (frontend, em outro
repositório) quanto os endpoints administrativos do backend
(`carshop-backend`, este repositório).

A preocupação central declarada na tarefa é que a proteção da área
`/admin` não dependa apenas de estado client-side, e que o backend
continue sendo a autoridade final de autorização — o que já é a
premissa da arquitetura atual descrita em `CLAUDE.md` e nas regras
`.claude/rules/security.md` e `.claude/rules/controllers.md`.

Esta especificação delimita explicitamente o escopo **apenas para este
repositório** (`carshop-backend`). Ela não define nem prescreve
comportamento do boundary Next.js (middleware de rota, redirecionamento
server-side, cookies lidos pelo Next.js), que é tratado fora deste
repositório.

A tarefa é de **auditoria + hardening** de um mecanismo já existente
(access token + refresh token `HttpOnly` rotativo + sessão server-side
via `SessionStorePort` + CSRF double-submit cookie), não uma correção
pontual já diagnosticada. O escopo exato de eventuais gaps deve ser
levantado a partir do estado real do código (`src/infra/presentation/
middleware/auth.middleware.ts`, `src/infra/presentation/middleware/
csrf-protection.middleware.ts`, `src/presentation/helpers/
auth.cookies.ts`, e os route builders em `src/infra/http/routes/*`),
não assumido a partir do Notion.

A tarefa complementa (sem substituir) CARSHOP-2, CARSHOP-29, CARSHOP-30
e CARSHOP-126. Nenhuma dessas tasks possui `spec.md`/`plan.md` versionado
neste repositório no momento da escrita desta especificação — exceto
CARSHOP-126 (`specs/CARSHOP-126/`), que já tratou especificamente do
atributo `SameSite` do cookie `refresh_token` para viabilizar o cenário
cross-origin. Esta especificação trata CARSHOP-126 como contexto
histórico relevante e não reabre a decisão de `SameSite`/`Secure` já
implementada, a menos que a auditoria encontre uma regressão real em
relação ao que está descrito naquela spec.

## Objective

Confirmar, por meio de auditoria do código atual e reforço pontual onde
necessário, que:

1. Todo endpoint administrativo deste repositório permanece protegido no
   backend por autenticação e validação de sessão server-side,
   independentemente de qualquer verificação client-side.
2. O contrato de sessão, refresh, CSRF e cookies já existente
   (access token + `refresh_token` `HttpOnly` rotativo + `csrf_token` /
   `X-CSRF-Token` double-submit) continua íntegro, sem enfraquecimento.
3. Ausência ou expiração de sessão nunca resulta em exposição de dado ou
   ação administrativa.
4. Nenhum token sensível (`refresh_token`, `accessToken` de sessões de
   terceiros, segredo de sessão) é persistido em `localStorage` por
   qualquer artefato deste repositório (por exemplo, exemplos de uso,
   documentação Swagger, ou scripts).
5. O gap de cobertura de teste para os cenários "acesso não autenticado"
   e "sessão expirada/inválida" nos endpoints administrativos é
   identificado e fechado.

O objetivo desta especificação é declarar **o que** deve ser garantido e
testável. A forma exata de eventual correção (por exemplo, adicionar um
teste faltante vs. corrigir um middleware) é decisão de implementação
dentro dos limites abaixo, não desta especificação.

## Scope Boundary (Neste Repositório)

Escopo **incluído** (carshop-backend):

- Middleware de autenticação (`auth.middleware.ts`) usado pelas rotas
  administrativas.
- Middleware de proteção CSRF (`csrf-protection.middleware.ts`) usado em
  `POST /auth/refresh` e `POST /auth/logout`.
- Atributos de cookies de sessão (`refresh_token`, `csrf_token`) definidos
  em `src/presentation/helpers/auth.cookies.ts`.
- Todos os route builders sob `src/infra/http/routes/*` que expõem rotas
  sob `/admin/*` (atualmente `admin-comment.routes.ts`,
  `admin-work.routes.ts`, `work-image.routes.ts` na parte montada em
  `/admin/works`), confirmando que cada rota mutante/administrativa usa
  `authMiddleware`.
- Comportamento observável de resposta HTTP para requisições sem token,
  com token expirado, ou com sessão revogada, nos endpoints
  administrativos.
- Testes automatizados (unitários e/ou e2e) que comprovem os itens
  acima.
- Documentação Swagger dos endpoints administrativos, apenas na medida em
  que precise refletir fielmente o comportamento real de autenticação já
  documentado ou corrigido.

Escopo **explicitamente fora deste repositório** (tratado no repositório
do frontend Next.js, fora do alcance desta especificação e de qualquer
implementação originada dela):

- Middleware de rota do Next.js (`middleware.ts` ou equivalente) que
  protege `/admin` no lado do cliente/servidor do frontend.
- Qualquer lógica de redirecionamento, layout condicional, ou guard de
  UI no frontend.
- Qualquer decisão de onde/como o frontend armazena o `accessToken` em
  memória (fora do escopo deste repositório, mas relevante como
  constraint: não pode depender de `localStorage` — ver NFR-003).

## Functional Requirements

- FR-001: Toda rota mutante/administrativa registrada sob os prefixos
  `/admin/comments` e `/admin/works` deve exigir autenticação válida via
  `authMiddleware` (token Bearer do tipo `access`, assinatura válida, não
  expirado, e sessão ativa em `SessionStorePort`) antes de executar
  qualquer efeito colateral (leitura ou escrita administrativa).
- FR-002: Uma requisição a qualquer rota administrativa sem header
  `Authorization: Bearer <token>` deve ser rejeitada com `401`, sem
  executar a ação solicitada.
- FR-003: Uma requisição a qualquer rota administrativa com um token
  expirado, malformado, ou com assinatura inválida deve ser rejeitada com
  `401`, sem executar a ação solicitada.
- FR-004: Uma requisição a qualquer rota administrativa com um token
  estruturalmente válido, mas cuja sessão (`sid`) não esteja mais ativa em
  `SessionStorePort` (por exemplo, após logout ou expiração server-side),
  deve ser rejeitada com `401`, sem executar a ação solicitada.
- FR-005: `POST /auth/refresh` e `POST /auth/logout` devem continuar
  exigindo a validação CSRF double-submit (`csrf_token` cookie +
  `X-CSRF-Token` header correspondentes) antes de processar a requisição.
- FR-006: O cookie `refresh_token` deve continuar sendo emitido com o
  atributo `HttpOnly`, tornando-o inacessível a JavaScript no navegador.
- FR-007: Nenhuma resposta HTTP de nenhum endpoint deste repositório
  (incluindo endpoints administrativos e de autenticação) deve incluir o
  valor do `refresh_token` no corpo da resposta ou em um header legível
  por JavaScript.
- FR-008: Quando a sessão de um administrador expira ou é revogada, uma
  requisição subsequente a qualquer endpoint administrativo que dependa
  dessa sessão deve ser rejeitada (`401`) e não deve retornar dado
  administrativo algum no corpo da resposta de erro.
- FR-009: A auditoria realizada por esta tarefa deve produzir uma lista
  explícita, rastreável no diff/implementação, de todas as rotas sob
  `/admin/*` e sua confirmação de uso de `authMiddleware` (ou identificação
  de gap, se algum for encontrado).

## Non-Functional Requirements

- NFR-001 (Segurança): Os atributos `HttpOnly`, `Secure`, `SameSite`,
  `path` e o tempo de expiração (`maxAge`) dos cookies `refresh_token` e
  `csrf_token`, conforme já definidos em
  `src/presentation/helpers/auth.cookies.ts` (e conforme decidido em
  CARSHOP-126), não podem ser enfraquecidos como efeito colateral desta
  tarefa.
- NFR-002 (Segurança): A proteção CSRF por double-submit cookie em
  `POST /auth/refresh` e `POST /auth/logout` não pode ser removida,
  contornada ou enfraquecida como efeito colateral desta tarefa.
- NFR-003 (Segurança): Nenhum artefato produzido por esta tarefa (código,
  teste, documentação, exemplo Swagger) pode sugerir, demonstrar, ou
  implementar armazenamento de `refresh_token` ou de qualquer token
  sensível em `localStorage`/`sessionStorage`.
- NFR-004 (Compatibilidade): O comportamento observável já existente para
  clientes legítimos (login, refresh, logout, acesso autenticado às rotas
  administrativas) deve continuar funcionando sem regressão perceptível.
- NFR-005 (Manutenibilidade): Qualquer gap de autenticação/autorização
  identificado pela auditoria e corrigido nesta tarefa deve ser coberto
  por um teste automatizado que falharia sem a correção, seguindo
  `.claude/rules/testing.md`.

## Acceptance Criteria

- AC-001: Para cada rota mutante/administrativa existente sob
  `/admin/comments` e `/admin/works`, um teste automatizado (unitário
  e/ou e2e) comprova que uma requisição sem header `Authorization`
  retorna `401` e não produz o efeito administrativo solicitado (ex.: o
  comentário não é aprovado/alterado, a imagem não é removida, o work não
  é excluído).
- AC-002: Para pelo menos uma rota representativa de cada route builder
  administrativo (`admin-comment.routes.ts`, `admin-work.routes.ts`,
  `work-image.routes.ts` na parte `/admin/works`), um teste automatizado
  comprova que uma requisição com token expirado ou com sessão inativa em
  `SessionStorePort` retorna `401` e não produz o efeito administrativo
  solicitado.
- AC-003: Um teste automatizado comprova que `POST /auth/refresh` e
  `POST /auth/logout` continuam retornando erro de rejeição CSRF (ex.:
  `403`) quando o `X-CSRF-Token` não corresponde ao `csrf_token` do
  cookie, sem processar a operação.
- AC-004: Uma inspeção do código de `src/presentation/helpers/
  auth.cookies.ts`, após a conclusão da tarefa, confirma que os atributos
  `HttpOnly` (para `refresh_token`), `Secure`, `SameSite`, `path` e
  `maxAge` permanecem equivalentes ou mais restritivos que o estado atual
  documentado nesta especificação.
- AC-005: Uma busca no diff/implementação produzida por esta tarefa
  confirma que nenhum trecho de código, teste ou documentação grava um
  token sensível em `localStorage`/`sessionStorage`.
- AC-006: A auditoria de rotas (FR-009) é reportada de forma explícita no
  resultado da implementação (por exemplo, no resumo do desenvolvedor),
  listando cada rota sob `/admin/*` e confirmando a presença de
  `authMiddleware`, com qualquer gap encontrado corrigido e coberto por
  teste antes da conclusão da tarefa.
- AC-007: Nenhum teste, log ou artefato de código produzido por esta
  tarefa expõe o valor de um token de acesso ou refresh token real fora
  do mecanismo já existente (cookie `HttpOnly` para `refresh_token`,
  corpo de resposta apenas para `accessToken` conforme contrato atual de
  `POST /auth/login`/`POST /auth/refresh`).

## Constraints

- Nenhuma alteração pode ser feita no boundary server-side do Next.js;
  esse trabalho pertence a outro repositório e está fora do escopo desta
  tarefa e desta especificação.
- Nenhuma implementação pode enviar o refresh token fora do cookie
  `HttpOnly` já existente.
- Os atributos de cookie definidos em CARSHOP-126 (`SameSite=None`,
  `Secure=true`, `HttpOnly` em `refresh_token`) não podem ser
  reabertos ou enfraquecidos sem evidência concreta de regressão
  encontrada pela auditoria.
- Nenhum valor real de variável de ambiente, segredo, credencial ou
  cookie real pode ser incluído em nenhum artefato versionado desta
  tarefa (`.claude/rules/spec-security.md`).
- A Base URL da API é fornecida via configuração de ambiente (`API_URL`
  do lado do consumidor); esta especificação não fixa nenhum valor
  concreto de ambiente.
- Autenticação de requisições segue a estratégia Bearer token já existente
  do projeto; nenhum valor de token é definido por esta especificação.

## Dependencies

- CARSHOP-2, CARSHOP-29, CARSHOP-30 — tasks anteriores relacionadas a
  autenticação/autorização, referenciadas como contexto complementar pela
  task original. Nenhuma possui `spec.md` versionado neste repositório no
  momento desta especificação; qualquer decisão relevante delas só pode
  ser considerada se confirmada no estado atual do código, não assumida.
- CARSHOP-126 (`specs/CARSHOP-126/spec.md`) — já formalizou o
  comportamento atual de `SameSite`/`Secure` do cookie `refresh_token`
  para suportar o cenário cross-origin; esta tarefa não reabre essa
  decisão sem evidência de regressão.
- `src/infra/presentation/middleware/auth.middleware.ts` — middleware de
  autenticação a ser auditado.
- `src/infra/presentation/middleware/csrf-protection.middleware.ts` —
  middleware de CSRF a ser auditado.
- `src/presentation/helpers/auth.cookies.ts` — implementação atual dos
  atributos de cookie a ser auditada.
- `src/infra/http/routes/admin-comment.routes.ts`,
  `src/infra/http/routes/admin-work.routes.ts`,
  `src/infra/http/routes/work-image.routes.ts` — route builders
  administrativos a serem auditados quanto ao uso de `authMiddleware`.
- `.claude/rules/security.md` e `.claude/rules/controllers.md` — modelo de
  segurança e convenções de rota já vigentes que devem ser preservados.

## Out of Scope

- Qualquer implementação de middleware, layout ou guard de rota no
  repositório do frontend Next.js.
- Qualquer decisão sobre onde o frontend armazena o `accessToken` em
  memória (constraint aplicável, mas implementação fora deste
  repositório).
- Mudança do modelo de expiração de access token, da estratégia de
  rotação de sessão, ou do atributo `SameSite`/`Secure` do cookie
  `refresh_token`, exceto se a auditoria encontrar uma regressão real em
  relação ao comportamento já formalizado em CARSHOP-126.
- Introdução de um novo mecanismo de autenticação (ex.: OAuth, MFA) não
  solicitado pela task original.
- Provisionamento de infraestrutura ou configuração de ambiente fora do
  código deste repositório.

## Risks

- Encontrar, durante a auditoria, uma rota administrativa que não usa
  `authMiddleware` — nesse caso, a correção deve ser tratada como
  hardening de segurança dentro desta mesma tarefa, coberta por teste
  antes da conclusão.
- Duplicar autorização apenas no frontend por engano, criando falsa
  sensação de segurança sem que o backend continue sendo a autoridade
  final — vetado explicitamente pela task original.
- Reabrir a decisão de `SameSite`/`Secure` de CARSHOP-126 sem evidência
  concreta, introduzindo regressão no fluxo cross-origin já resolvido.
- Escopo cruzar acidentalmente para o repositório do frontend Next.js
  durante a implementação, violando o Scope Boundary desta especificação.

## Open Questions

### Blocking

Nenhuma.

### Non-blocking

- Se a auditoria de rotas (FR-009/AC-006) encontrar um gap concreto de
  `authMiddleware` ausente em alguma rota administrativa, o `architect`
  deve avaliar se a correção é um ajuste local (mantém classificação
  atual da tarefa) ou se revela um problema maior de composição de rotas
  que justificaria reclassificação — decisão de arquitetura, não desta
  especificação.
- O conteúdo exato e o estado atual de CARSHOP-2, CARSHOP-29 e CARSHOP-30
  não puderam ser confirmados a partir de `specs/` neste repositório (não
  possuem `spec.md`/`plan.md` versionados aqui); qualquer achado relevante
  dessas tasks deve ser levantado a partir do Notion ou do estado atual do
  código, não assumido.

## Traceability

FR-001 → AC-001, AC-002
FR-002 → AC-001
FR-003 → AC-002
FR-004 → AC-002
FR-005 → AC-003
FR-006 → AC-004
FR-007 → AC-007
FR-008 → AC-001, AC-002
FR-009 → AC-006
NFR-001 → AC-004
NFR-002 → AC-003
NFR-003 → AC-005
NFR-004 → AC-001, AC-002, AC-003
NFR-005 → AC-006
