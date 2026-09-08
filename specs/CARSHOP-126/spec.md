# CARSHOP-126 — Revisar SameSite do refresh_token para viabilizar frontend cross-origin (Next.js local + Vercel)

## Status

Ready

## Source

Notion Task:
CARSHOP-126

## Context

O cookie `refresh_token` é emitido hoje com `HttpOnly` e `SameSite=Strict`
(`src/presentation/helpers/auth.cookies.ts`). `SameSite=Strict` impede o
navegador de reenviar o cookie em requisições cross-site, mesmo quando o
cliente usa `fetch`/`XHR` com `credentials: 'include'`.

O frontend Next.js roda em uma origem diferente da do backend — em
desenvolvimento local (`localhost:3000`) e em produção (domínio Vercel) —
contra o backend hospedado separadamente (Render). Essa é uma relação
cross-origin, não apenas cross-site em produção: o problema já bloqueia
testes locais do frontend hoje.

Efeito observado/esperado:

- `POST /auth/login` funciona normalmente (o `accessToken` retorna no
  corpo da resposta, que não depende de cookie).
- `POST /auth/refresh` e `POST /auth/logout` tendem a falhar
  silenciosamente, pois o cookie `refresh_token` nunca chega de volta ao
  backend nessas condições.

Esta é uma mudança em autenticação/cookies/segurança e, portanto, segue o
fluxo NON-TRIVIAL: `spec-writer` → `architect` → `plan-writer` antes de
qualquer edição em `src/`.

## Objective

Permitir que o fluxo completo de autenticação (login, refresh, logout)
funcione de ponta a ponta quando o frontend é servido de uma origem
diferente da do backend (cross-origin), preservando o modelo de segurança
atual — token de acesso de curta duração, refresh token `HttpOnly`
rotativo, sessão controlada no servidor, e proteção CSRF por
double-submit cookie (`csrf_token` + header `X-CSRF-Token`) — sem
introduzir nenhum workaround client-side que exponha o refresh token fora
de um cookie `HttpOnly`.

A decisão de **como** viabilizar o cenário cross-origin (ajuste de
`SameSite`, alinhamento de `CORS_ORIGIN`/`credentials`, uso de proxy/
rewrite no lado do frontend, ou outra alternativa) é de responsabilidade
do `architect`, que deve comparar os trade-offs e emitir um veredito
antes de qualquer implementação.

## Functional Requirements

- FR-001: O fluxo `POST /auth/login` → `POST /auth/refresh` deve
  funcionar quando o frontend está hospedado em uma origem diferente da
  do backend (cross-origin), incluindo o cenário de desenvolvimento local
  (`localhost:3000` contra o backend hospedado) e o cenário de produção
  (domínio Vercel contra o backend no Render).
- FR-002: O fluxo `POST /auth/logout` deve funcionar nas mesmas condições
  cross-origin descritas em FR-001, revogando efetivamente a sessão do
  lado do servidor.
- FR-003: Quando o cookie `refresh_token` não é enviado pelo navegador na
  requisição (por exemplo, ausência do cookie ou bloqueio pelo próprio
  navegador), `POST /auth/refresh` e `POST /auth/logout` devem continuar
  retornando um erro HTTP explícito e não silencioso (ex.: `401`), como já
  ocorre hoje para requisições sem cookie válido.
- FR-004: A proteção CSRF por double-submit cookie (`csrf_token` +
  header `X-CSRF-Token`) exigida em `POST /auth/refresh` e
  `POST /auth/logout` deve continuar obrigatória e funcional após a
  mudança, no cenário same-origin e no cenário cross-origin.
- FR-005: Qualquer requisição que utilize um valor de `X-CSRF-Token` que
  não corresponda ao `csrf_token` do cookie da sessão deve continuar
  sendo rejeitada, no cenário same-origin e no cenário cross-origin.
- FR-006: O cookie `refresh_token` deve continuar sendo emitido com o
  atributo `HttpOnly`, tornando-o inacessível a JavaScript no navegador,
  em qualquer cenário (same-origin ou cross-origin) e em qualquer
  ambiente (desenvolvimento ou produção).
- FR-007: A mudança não pode introduzir nenhum caminho no qual o valor do
  refresh token seja exposto ao cliente fora do cookie `HttpOnly` (por
  exemplo, no corpo da resposta JSON, em um header legível por
  JavaScript, ou em `localStorage`/`sessionStorage` via qualquer script
  fornecido pelo backend).
- FR-008: O comportamento de rotação do refresh token (emissão de um novo
  `refresh_token` e `csrf_token` a cada `POST /auth/refresh` bem-sucedido)
  deve ser preservado no cenário cross-origin.
- FR-009: A Swagger existente para `POST /auth/login`,
  `POST /auth/refresh`, `POST /auth/logout` e demais endpoints que
  documentam o comportamento de cookies deve refletir fielmente qualquer
  atributo de cookie alterado por esta tarefa (ex.: `SameSite`), sem
  divergir do comportamento real implementado.

## Non-Functional Requirements

- NFR-001 (Segurança): Os atributos `HttpOnly`, `Secure`, `path` e o
  tempo de expiração (`maxAge`) do cookie `refresh_token` não podem ser
  enfraquecidos em relação ao comportamento atual como efeito colateral
  desta mudança.
- NFR-002 (Segurança): A proteção CSRF por double-submit cookie não pode
  ser removida, contornada ou enfraquecida como efeito colateral desta
  mudança, em nenhum ambiente.
- NFR-003 (Segurança): Nenhuma solução aceita por esta especificação pode
  depender de enviar o refresh token fora de um cookie `HttpOnly`
  gerenciado pelo backend (ex.: workaround client-side que armazene o
  refresh token em memória do frontend, `localStorage` ou corpo de
  resposta).
- NFR-004 (Compatibilidade): O comportamento de autenticação já existente
  para requisições same-origin (quando o frontend e o backend
  compartilham a mesma origem, incluindo eventuais proxies/rewrites que
  tornem a chamada same-site do ponto de vista do navegador) deve
  continuar funcionando sem regressão perceptível pelo cliente.
- NFR-005 (Configuração): Qualquer dependência entre esta mudança e a
  variável de ambiente `CORS_ORIGIN` (incluindo a necessidade de
  `credentials: true` na configuração de CORS do Express) deve ser
  documentada explicitamente pelo `architect` e refletida nos testes,
  sem que o valor real de `CORS_ORIGIN` de nenhum ambiente apareça em
  nenhum artefato versionado.

## Acceptance Criteria

- AC-001: Em um teste (unitário e/ou e2e) que simula uma requisição
  `POST /auth/refresh` originada de uma origem diferente da do backend,
  com o cookie `refresh_token` presente e válido e o header
  `X-CSRF-Token` correspondente ao `csrf_token`, a resposta deve ser
  `200` com um novo `accessToken` e novos cookies de sessão rotacionados.
- AC-002: Em um teste equivalente para `POST /auth/logout` nas mesmas
  condições cross-origin do AC-001, a resposta deve ser bem-sucedida e a
  sessão correspondente deve deixar de ser válida para um `refresh`
  subsequente.
- AC-003: Quando o `X-CSRF-Token` enviado não corresponde ao
  `csrf_token` da sessão (cenário same-origin ou cross-origin), tanto
  `POST /auth/refresh` quanto `POST /auth/logout` devem retornar um erro
  HTTP de rejeição (ex.: `401`/`403`, conforme padrão já existente no
  projeto), sem processar a operação.
- AC-004: Quando o cookie `refresh_token` está ausente da requisição
  (cenário same-origin ou cross-origin), `POST /auth/refresh` e
  `POST /auth/logout` devem retornar um erro HTTP explícito (ex.: `401`),
  sem sucesso silencioso nem exceção não tratada.
- AC-005: Uma inspeção dos atributos do cookie `refresh_token` definidos
  em código, após a implementação, confirma que `HttpOnly` permanece
  `true`, que `path` e o tempo de expiração (`maxAge`) permanecem
  equivalentes aos valores atuais, e que `Secure` permanece ativo pelo
  menos em produção.
- AC-006: O fragmento Swagger correspondente a `POST /auth/login`,
  `POST /auth/refresh` e `POST /auth/logout` reflete o atributo
  `SameSite` (e qualquer outro atributo de cookie) efetivamente
  implementado, sem divergência entre documentação e comportamento real.
- AC-007: Nenhum teste, log ou artefato de código produzido por esta
  tarefa expõe o valor do refresh token fora do mecanismo de cookie
  `HttpOnly` (por exemplo, em corpo de resposta JSON ou em um header
  legível por JavaScript).
- AC-008: O `architect` emite um veredito explícito —
  `READY FOR IMPLEMENTATION` ou `BLOCKED` — antes de qualquer alteração
  em `src/`, avaliando explicitamente o trade-off entre `SameSite=None`
  (com `Secure`) e alternativas arquiteturais (ex.: proxy/rewrite
  same-site no frontend).

## Constraints

- A decisão de qual mecanismo usar para viabilizar o cenário
  cross-origin (`SameSite=None; Secure`, alinhamento de `CORS_ORIGIN`
  com `credentials: true`, proxy/rewrite no frontend, ou combinação
  dessas) pertence ao `architect`; esta especificação não prescreve a
  solução técnica.
- Nenhuma implementação pode enviar o refresh token fora de um cookie
  `HttpOnly` controlado pelo backend.
- Os atributos `HttpOnly`, `Secure`, `path` e expiração do cookie
  `refresh_token` não podem ser enfraquecidos.
- A proteção CSRF por double-submit cookie deve continuar obrigatória em
  `POST /auth/refresh` e `POST /auth/logout`.
- Nenhum valor real de `CORS_ORIGIN`, segredo, credencial ou cookie real
  pode ser incluído em nenhum artefato versionado desta tarefa
  (`.claude/rules/spec-security.md`).
- A Base URL da API é fornecida via configuração de ambiente
  (`API_URL` do lado do consumidor, `CORS_ORIGIN` do lado do backend);
  esta especificação não fixa nenhum valor concreto de ambiente.

## Dependencies

- CARSHOP-124 — Documentar contrato de API atual do backend para
  consumo do frontend (já referencia esta tarefa como limitação
  conhecida a ser resolvida).
- CARSHOP-125 — Configurar `CORS_ORIGIN` no Render; uma solução baseada
  em `SameSite=None` provavelmente depende de `CORS_ORIGIN` estar
  corretamente configurada com `credentials: true` para funcionar em
  navegadores.
- `src/presentation/helpers/auth.cookies.ts` — implementação atual dos
  atributos do cookie `refresh_token`/`csrf_token`.
- `.claude/rules/security.md` — modelo de segurança de autenticação que
  deve ser preservado.

## Out of Scope

- Definir ou fixar o valor real de `CORS_ORIGIN` em qualquer ambiente —
  tratado por CARSHOP-125.
- Qualquer workaround client-side que envie o refresh token fora de um
  cookie `HttpOnly` (explicitamente vetado pela task original).
- Mudanças no modelo de expiração de access token, na estratégia de
  rotação de sessão em si (além do necessário para preservar o
  comportamento atual sob o novo cenário cross-origin), ou em outros
  endpoints não relacionados a autenticação.
- Provisionamento de infraestrutura de proxy/CDN fora do escopo do
  próprio backend/frontend já existentes no repositório.

## Risks

- Enfraquecer a proteção CSRF ou os atributos do cookie (`HttpOnly`,
  `Secure`, `path`, expiração) ao ajustar `SameSite`.
- Acoplar a solução a um workaround client-side inseguro que exponha o
  refresh token fora de um cookie `HttpOnly`.
- Dependência cruzada com a configuração de `CORS_ORIGIN`
  (`credentials: true`): alterar `SameSite` sem alinhar CORS pode não
  resolver o problema relatado ou introduzir uma nova falha silenciosa.
- Divergência entre o comportamento documentado no Swagger e o
  comportamento real dos cookies, caso a documentação não seja
  atualizada junto com a implementação.

## Open Questions

### Blocking

Nenhuma.

### Non-blocking

- Qual mecanismo concreto o `architect` escolherá
  (`SameSite=None; Secure` vs. proxy/rewrite no Next.js vs. outra
  alternativa) — decisão de arquitetura, não de especificação.
- Se a solução escolhida exigir uma nova variável de ambiente ou um
  ajuste de valor operacional de `CORS_ORIGIN`, o valor real permanece
  fora do escopo desta especificação e de qualquer artefato versionado.

## Traceability

FR-001 → AC-001
FR-002 → AC-002
FR-003 → AC-004
FR-004 → AC-001, AC-002, AC-003
FR-005 → AC-003
FR-006 → AC-005
FR-007 → AC-007
FR-008 → AC-001
FR-009 → AC-006
NFR-001 → AC-005
NFR-002 → AC-003
NFR-003 → AC-007
NFR-004 → AC-001, AC-002
NFR-005 → AC-008
