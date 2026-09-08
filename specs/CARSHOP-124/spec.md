# CARSHOP-124 — Documentar contrato de API atual do backend para consumo do frontend

## Status

Ready

## Source

Notion Task:
CARSHOP-124

## Context

O time de frontend (Next.js) precisa iniciar a integração com o
`carshop-backend`, já publicado em ambiente de deploy gerenciado (Render).
Hoje o contrato HTTP existe de forma fragmentada entre o Swagger
(`src/infra/docs/*.swagger.ts`) e o comportamento real das rotas
(`src/infra/http/routes/*.routes.ts`), sem um documento único, consolidado
e voltado para consumo externo que cubra endpoints, payloads, respostas,
códigos de status, autenticação e cookies.

Esta tarefa é de documentação: consolida e expõe o contrato HTTP já
implementado. Ela explicitamente não envolve mudança de comportamento no
backend. Nenhum arquivo em `src/` deve ser alterado, exceto correção de
divergência pontual entre um fragmento Swagger existente e o comportamento
real observado nas rotas — nesse caso, a correção é de documentação
(alinhar o Swagger ao comportamento real), nunca de comportamento.

## Objective

Produzir um documento de contrato de API único e atualizado, derivado do
Swagger existente e das rotas reais, suficiente para o time de frontend
iniciar a integração sem precisar ler o código-fonte do backend, incluindo
alertas operacionais relevantes ao ambiente de deploy atual (cookies
cross-origin, CORS pendente, cold start, disponibilidade do Swagger).

## Functional Requirements

- FR-001: O documento deve listar todos os endpoints de autenticação —
  `POST /auth/login`, `POST /auth/refresh`, `POST /auth/logout`,
  `GET /auth/session` — com método, path, corpo de requisição, corpo de
  resposta de sucesso, códigos de status de erro relevantes e requisitos
  de autenticação/CSRF de cada um, refletindo fielmente
  `src/infra/docs/auth.swagger.ts` e `src/infra/http/routes/auth.routes.ts`.
- FR-002: O documento deve descrever o modelo de cookies usado pela
  autenticação: `refresh_token` (`HttpOnly`) e `csrf_token` (legível pelo
  cliente), incluindo o uso do header `X-CSRF-Token` em `POST /auth/refresh`
  e `POST /auth/logout` (padrão double-submit), sem incluir valores reais
  de cookies ou tokens.
- FR-003: O documento deve listar os endpoints de trabalhos (`works`) —
  `GET /works`, `GET /works/{slug}`, `POST /works` — com parâmetros
  (incluindo `includeDrafts`), corpo de requisição, o schema completo de
  `WorkResponse`, códigos de sucesso e erro, e a exigência de Bearer token
  quando aplicável (`includeDrafts=true` e `POST /works`).
- FR-004: O documento deve listar os endpoints públicos de comentários —
  `GET /works/{workId}/comments`, `POST /works/{workId}/comments` —
  incluindo o corpo de requisição, o schema de `CommentResponse` e o
  status inicial `PENDING` atribuído a comentários recém-criados.
- FR-005: O documento deve listar os endpoints administrativos de
  comentários (`/admin/comments/{commentId}/approve`,
  `/admin/comments/{commentId}` PATCH e DELETE), com corpo de requisição,
  respostas de sucesso/erro e a exigência de Bearer token em todos eles.
- FR-006: O documento deve listar os endpoints administrativos de
  works/imagens (`/admin/works/{workId}/images` POST,
  `/admin/works/{workId}/images/{imageId}` DELETE,
  `/admin/works/{workId}` DELETE), incluindo:
  - as regras de upload (multipart/form-data, campo `file`, tipos aceitos
    JPEG/PNG/WebP, limite de 5 MB, verificação do conteúdo binário real do
    arquivo);
  - o comportamento de `isCover`;
  - o comportamento de exclusão em cascata do work (imagens no storage
    externo e comentários associados) e a garantia de que a operação é
    abortada antes de alterar o MongoDB caso a remoção no storage externo
    falhe;
  - todos os códigos de sucesso e erro documentados no Swagger existente
    (`400`, `401`, `404`, `413`, `415`, `500`, `502` conforme aplicável).
- FR-007: O documento deve listar os endpoints de health check —
  `GET /` e `GET /health` — incluindo os dois formatos de resposta de
  `GET /health` (`200 { status: "ok", database: "connected" }` e
  `503 { status: "degraded", database: "disconnected" }`).
- FR-008: O documento deve referenciar `GET /docs` (Swagger UI) e
  `GET /docs.json` (spec OpenAPI) como fonte viva do contrato, indicando
  explicitamente que a disponibilidade desses endpoints depende das
  variáveis `ENABLE_SWAGGER` e `NODE_ENV`, e que portanto pode estar
  desabilitada no ambiente de produção atual — sem afirmar categoricamente
  que estará disponível.
- FR-009: O documento deve conter uma seção de alerta explícito sobre
  cookies cross-origin, descrevendo que `refresh_token` é `HttpOnly` e
  `SameSite=Strict`, que portanto não é enviado em requisições cross-site
  mesmo com `credentials: 'include'`, e que isso pode causar falha
  silenciosa em `POST /auth/refresh` e `POST /auth/logout` quando o
  frontend Next.js está hospedado em domínio diferente do backend. O
  documento deve indicar que essa é uma limitação atual conhecida, tratada
  por uma tarefa dedicada (CARSHOP-126), e não deve propor nenhum
  workaround client-side que enfraqueça a proteção CSRF/cookie.
- FR-010: O documento deve mencionar que chamadas do navegador dependem de
  `CORS_ORIGIN` estar configurada no backend para a origem do frontend, e
  que essa configuração está pendente em tarefa separada (CARSHOP-125).
- FR-011: O documento deve sugerir, de forma explicitamente não
  vinculante ("a validar com o time"), o uso de uma variável de ambiente
  do frontend (ex.: `NEXT_PUBLIC_API_URL`) apontando para a Base URL do
  backend, usando o valor público de produção já documentado nesta
  especificação (`https://carshop-backend-htag.onrender.com`) apenas como
  exemplo, sem tratá-lo como decisão fechada.
- FR-012: O documento deve mencionar o comportamento de cold start do
  free tier do Render em relação ao endpoint `GET /health`, para que o
  frontend possa considerar esse comportamento ao desenhar sua estratégia
  de retry/loading.

## Non-Functional Requirements

- NFR-001: O conteúdo do documento deve ser rastreável à fonte de verdade
  (Swagger existente e rotas reais); nenhuma seção deve descrever
  comportamento não implementado no repositório atual.
- NFR-002: O documento e qualquer artefato produzido por esta tarefa devem
  cumprir `.claude/rules/spec-security.md`: nenhuma credencial, segredo,
  valor real de variável de ambiente, cookie real ou token real pode ser
  incluído. A Base URL de produção mencionada nesta especificação é
  informação pública do próprio projeto (endpoint HTTP exposto), não um
  segredo, mas exemplos de payload devem usar valores fictícios (ex.:
  e-mails `user@example.com`, tokens `<ACCESS_TOKEN>`).
- NFR-003: Qualquer divergência encontrada entre o Swagger existente e o
  comportamento real das rotas deve ser corrigida apenas na documentação
  Swagger (arquivos `src/infra/docs/*.swagger.ts`), nunca alterando o
  comportamento das rotas, controllers ou use cases.

## Acceptance Criteria

- AC-001: O documento final contém uma seção para cada um dos quatro
  endpoints de autenticação, cada uma especificando método, path, corpo de
  requisição (quando aplicável), corpo de resposta de sucesso, códigos de
  erro e requisitos de autenticação/CSRF.
- AC-002: O documento final contém uma seção descrevendo os dois cookies
  de autenticação (`refresh_token`, `csrf_token`) e o uso do header
  `X-CSRF-Token`, sem nenhum valor real de cookie.
- AC-003: O documento final contém uma seção para cada endpoint de
  `works` (`GET /works`, `GET /works/{slug}`, `POST /works`) com o schema
  completo de `WorkResponse` reproduzido ou referenciado.
- AC-004: O documento final contém uma seção para os endpoints públicos de
  comentários, indicando que o status inicial de um comentário criado é
  `PENDING`.
- AC-005: O documento final contém uma seção para cada endpoint
  administrativo de comentários, indicando a exigência de Bearer token em
  todos eles.
- AC-006: O documento final contém uma seção descrevendo as regras de
  upload de imagem (multipart, campo `file`, tipos aceitos, limite de
  5 MB) e uma seção descrevendo a exclusão em cascata de um work.
- AC-007: O documento final contém uma seção para `GET /` e `GET /health`,
  incluindo os dois formatos de resposta de `GET /health` (`ok`/`connected`
  e `degraded`/`disconnected`).
- AC-008: O documento final contém um link/referência textual para
  `GET /docs` e `GET /docs.json`, junto com uma nota de que a
  disponibilidade depende de `ENABLE_SWAGGER` e `NODE_ENV`.
- AC-009: O documento final contém uma seção de alerta específica sobre
  cookies cross-origin em `refresh`/`logout`, mencionando explicitamente
  `HttpOnly`, `SameSite=Strict` e a referência à tarefa CARSHOP-126, sem
  propor nenhum workaround client-side que reduza a proteção CSRF/cookie.
- AC-010: O documento final contém uma nota sobre a dependência de
  `CORS_ORIGIN` (CARSHOP-125) para chamadas do navegador funcionarem.
- AC-011: O documento final contém uma sugestão explicitamente rotulada
  como não vinculante para uma variável de ambiente do frontend apontando
  para a Base URL do backend.
- AC-012: Nenhum arquivo sob `src/` é alterado por esta tarefa, exceto,
  quando aplicável, correções pontuais em `src/infra/docs/*.swagger.ts`
  para alinhar a documentação Swagger ao comportamento real já existente
  nas rotas — sem qualquer alteração de comportamento observável da API.
- AC-013: Nenhum valor real de credencial, segredo, cookie, token ou
  variável de ambiente aparece em nenhum arquivo produzido por esta
  tarefa.

## Constraints

- Não há mudança de comportamento no backend; esta é uma tarefa de
  documentação/consolidação.
- O formato exato do arquivo de saída (Markdown, localização dentro do
  repositório, se acompanha ou substitui o Swagger) é uma decisão do
  developer, respeitando as convenções existentes do repositório — a
  especificação define o conteúdo obrigatório, não o formato de entrega.
- O Swagger existente (`src/infra/docs/*.swagger.ts`) e as rotas reais
  (`src/infra/http/routes/*.routes.ts`) são a fonte de verdade de conteúdo;
  a tarefa deve refletir o comportamento atual do repositório, não
  redefini-lo.
- Toda menção a segredos, credenciais ou valores sensíveis deve seguir
  `.claude/rules/spec-security.md` e usar apenas placeholders/exemplos
  fictícios.
- Nenhum workaround client-side que enfraqueça a proteção CSRF/cookie pode
  ser proposto para contornar a limitação de cookies cross-origin.

## Dependencies

- CARSHOP-125 — configuração de `CORS_ORIGIN` no Render, ainda pendente;
  bloqueia chamadas do navegador até ser resolvida.
- CARSHOP-126 — revisão do `SameSite` do `refresh_token`, já aberta para
  avaliação do architect; é a tarefa dona da limitação de cookies
  cross-origin descrita em FR-009/AC-009.
- Swagger existente em `src/infra/docs/*.swagger.ts` e rotas reais em
  `src/infra/http/routes/*.routes.ts` como fonte de conteúdo.

## Out of Scope

- Qualquer alteração de comportamento de autenticação, cookies, CORS,
  upload ou persistência.
- Resolver a limitação de cookies cross-origin (CARSHOP-126) ou configurar
  `CORS_ORIGIN` (CARSHOP-125) — esta tarefa apenas documenta e referencia
  essas dependências pendentes.
- Definir ou fixar o valor final de `NEXT_PUBLIC_API_URL` no frontend —
  apenas sugestão não vinculante.
- Aprovação final do time de frontend sobre a suficiência do documento —
  critério humano externo ao workflow de agentes, não verificável por
  esta especificação.

## Risks

- Cookies cross-origin: `refresh_token` `HttpOnly` + `SameSite=Strict` não
  é enviado em requisições cross-site mesmo com `credentials: 'include'`,
  podendo causar falha silenciosa em `POST /auth/refresh` e
  `POST /auth/logout` quando o frontend está em domínio diferente do
  backend em produção. Não deve ser contornado nem corrigido silenciosamente
  nesta tarefa.
- `CORS_ORIGIN` indefinida bloqueia chamadas do navegador até CARSHOP-125
  ser resolvida.
- O Swagger pode estar desabilitado em produção (`ENABLE_SWAGGER`/
  `NODE_ENV`); o documento não deve afirmar disponibilidade garantida de
  `/docs` e `/docs.json` sem essa ressalva.

## Open Questions

### Blocking

Nenhuma.

### Non-blocking

- Formato final de entrega do documento (Markdown dedicado, seção no
  README, ou outro) fica a critério do developer, respeitando convenções
  do repositório.
- Confirmação final de que `ENABLE_SWAGGER` está ativo no ambiente de
  produção atual do Render não pôde ser verificada nesta especificação;
  o documento deve tratar isso como condicional, não como fato confirmado.

## Traceability

FR-001 → AC-001
FR-002 → AC-002
FR-003 → AC-003
FR-004 → AC-004
FR-005 → AC-005
FR-006 → AC-006
FR-007 → AC-007
FR-008 → AC-008
FR-009 → AC-009
FR-010 → AC-010
FR-011 → AC-011
FR-012 → AC-007
NFR-002 → AC-013
NFR-003 → AC-012
