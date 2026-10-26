# CARSHOP-140 — Implementation Plan

## Source

Specification:
`specs/CARSHOP-140/spec.md`

Plano de arquitetura aprovado pelo `architect` (anti-bot em escrita pública), persistido sem reinterpretação.

## Architect Verdict

READY FOR IMPLEMENTATION

Sem perguntas bloqueantes. Honeypot opcional compatível (campo `website`) aplicado por middleware dedicado em `POST /works/{workId}/comments`, após o limitador de comentários e antes do controller; sem dependência, sem env, sem segredo, sem header novo, sem mudança de CORS. Ressalva: até o frontend renderizar o campo oculto, a camada não bloqueia bots reais — documentar.

## Objective

Rejeitar submissões automatizadas de comentário sem quebrar o envio legítimo atual (`authorName` + `content`), sem depender de `User-Agent`, sem expor detalhes internos, mantendo intactos os três limitadores (`globalRateLimitMiddleware`, `commentRateLimitMiddleware`, `loginRateLimitMiddleware`), com política documentada e Swagger/testes atualizados. Todos os ACs mapeados em "Definition of Done Mapping"; AC-007 é N/A (sem configuração nova) e deve estar documentado.

## Current Architecture

Estado atual confirmado no repositório:

- Fluxo: `src/infra/config/routes.ts` monta `/works` → `buildWorkRouter` (`src/infra/http/routes/work.routes.ts:74-78`) → `commentRateLimitMiddleware` → `CommentController.create` → `validateWithSchema(createCommentSchema)` → `CreateCommentUseCase` → `CommentRepositoryPort.createPending`. Controller repassa ao use case só `workId`, `authorName`, `content`. Erro de schema = `HttpError(400, 'Payload inválido.', z.flattenError(...))` — inclui `details`.
- Conflito 1 (HTML guard): `src/infra/presentation/validators/comment.schema.ts` NÃO tem `.refine`/guard de HTML; não existe `html-content.guard.ts` em `src/`. Schema = `z.object({authorName: trim 2–80, content: trim 3–1000}).strict()`. Prevalece o repositório.
- Conflito 2 (`commentRateLimitMiddleware`): singleton de módulo em `src/infra/presentation/middleware/rate-limit.middleware.ts`, janela 10 min, limite 10, chave `ipKeyGenerator(request.ip)`, `skipSuccessfulRequests: false`, mensagem `'Muitas tentativas de comentário. Tente novamente em alguns minutos.'` Confere com o vault.
- Conflito 3 (`CreateAppOverrides`): `{ imageStorage?: ImageStoragePort }` (`src/infra/server.ts:34-36`). Confere; não muda.
- Conflito 4 (CORS `allowedHeaders`): `['Content-Type','Authorization','X-CSRF-Token']` (`src/infra/config/middleware.ts:36`). Confere; não muda.
- Error handler (`src/infra/presentation/middleware/error-handler.middleware.ts`) tem 4 parâmetros; para `HttpError` responde `{message, details}` (`details: undefined` some do JSON).
- Express `^5.2.1` (body `undefined` sem parser compatível), zod `^4.3.6`, OpenAPI `3.0.3`.
- Swagger `CommentRequest` em `src/infra/docs/comments.swagger.ts` confere campo a campo com o schema atual (2–80, 3–1000) — drift do CARSHOP-124 resolvido.
- Rotas públicas de escrita: única anônima é `POST /works/:workId/comments`. `POST /auth/login` é pública porém exclusiva do admin; `/auth/refresh` e `/auth/logout` exigem cookies de sessão + CSRF.

### Conhecimento histórico (Obsidian) avaliado

- ADR-005: compatível, nenhum pacote necessário.
- Contrato auth/CORS/CSRF: confirmado (`allowedHeaders` atual); mudança evitada usando campo no body.
- Padrão de validação de env: N/A (sem env nova).
- Seam `CreateAppOverrides`: confirmado `{imageStorage?}`; não usado.
- `validateWithSchema` inline vs middleware dedicado: compatível, justificativa em D3.
- `CommentForm` envia 2 campos por `.strict()`: resolvido com campo opcional (D2).
- `withRetryBackoff` reenvia 429/5xx: motiva 400 (D5).
- Learning defesa em profundidade E2E: aplicado (isolamento unitário + diferença de `details`).
- Learning variações adversariais / sem trim: aplicado (D6).
- `TRUST_PROXY_HOPS`/XFF: sem heurística por IP; padrão não muda; E2E sem XFF.
- Drift Swagger `CommentRequest` (CARSHOP-124): alinhado hoje; re-verificar após mudança.
- Error handler 4 parâmetros, `next(error)`, não logar cadeia `cause`: preservado.
- Conflito HTML guard: vault diverge; código atual não tem guard; plano segue o repositório.

## Proposed Solution

Honeypot opcional (campo `website`), decidido server-side por um middleware dedicado `commentAntiBotMiddleware` em `src/infra/presentation/middleware/anti-bot.middleware.ts`, encadeado em `POST /works/:workId/comments` na ordem `commentRateLimitMiddleware` → `commentAntiBotMiddleware` → `commentController.create`. O campo é opcional: ausente ou `""` é aceito; qualquer outro valor é rejeitado com `400 { "message": "Payload inválido." }` sem `details`. O schema Zod também passa a aceitar `website: z.literal('').optional()` como defesa em profundidade. Nenhuma dependência, variável de ambiente, segredo, header ou mudança de CORS. Documentação em `docs/anti-bot-policy.md`, `docs/api-contract.md`, Swagger e `README.md`.

## Technical Decisions

### D1 — Mecanismo: honeypot opcional (`website`), decidido server-side

#### Decision

Usar honeypot com campo opcional `website`, avaliado no servidor.

#### Reason

Sem dependência/segredo/env; falso positivo praticamente nulo (campo oculto, `autocomplete="off"`, não é tipo autopreenchido); zero interação; não usa `User-Agent` (FR-004 por construção). Proporcionalidade (NFR-002): volume já limitado (10/10 min por IP + global); todo comentário nasce `PENDING` e passa por moderação → risco residual é carga de moderação, não publicação de spam. ADR-005: nenhuma lib adotada; nenhum pacote necessário para honeypot; interop ESM/CJS N/A.

#### Alternatives Considered

- Alternativa A (provedor externo Turnstile/hCaptcha/reCAPTCHA) — rejeitada por desproporcional (tarefa de 3 pontos, portfólio pequeno): dependência/chamada HTTP nova, segredo novo validado em `env.ts`, porta+adapter+override em `CreateAppOverrides`, política de timeout, widget obrigatório no frontend sem tarefa vinculada (quebraria envio atual ou forçaria fail-open anulando a proteção), impacto de privacidade/acessibilidade, disponibilidade de terceiro, repasse via `/api-proxy`.
- Alternativa B (token assinado HMAC de tempo mínimo) — rejeitada: endpoint novo para emitir token, segredo novo, mudança obrigatória no frontend.
- Alternativa C (heurística de conteúdo, ex. contagem de links) — rejeitada: muda regra de aceitação de conteúdo legítimo (decisão de produto) e risco real de falso positivo.

#### Trade-offs

Proteção simples e sem custo operacional, porém limitada a bots que preenchem o campo (ver D2 e Risks).

### D2 — Compatibilidade: campo opcional

#### Decision

Campo opcional. Ausente ou `""` → aceito; qualquer outro valor → rejeitado. Frontend atual (só `authorName`/`content`) continua funcionando (`.strict()` passa a aceitar `website` opcional).

#### Reason

Preservar o envio legítimo atual sem tarefa de frontend vinculada.

#### Alternatives Considered

Tornar o campo obrigatório — adiado (endurecimento futuro, fora de escopo).

#### Trade-offs

Limitação a documentar: até o frontend renderizar o campo oculto, o honeypot só pega bots que enviam o campo; bots de API direta com só 2 campos continuam limitados por rate limiters + moderação. Endurecimento futuro (fora de escopo, registrar no doc): após o frontend sempre enviar `website: ""`, avaliar torná-lo obrigatório em outra tarefa.

### D3 — Camada: middleware dedicado

#### Decision

Middleware dedicado `src/infra/presentation/middleware/anti-bot.middleware.ts` (ao lado de rate-limit e CSRF). Use case inalterado.

#### Reason

Não só Zod no controller porque: erro Zod devolve `details` com o nome do campo (revela o mecanismo); decisão anti-bot precisa ser isolável/testável (learning defesa em profundidade); padrão "middleware só para outro artefato/momento" se aplica — é política anti-automação que roda antes da validação de payload e reutilizável, não segunda abstração genérica de validação.

#### Alternatives Considered

- Apenas Zod no controller — rejeitada (motivos acima).
- No use case — rejeitada: não é regra de domínio.

#### Trade-offs

Um artefato a mais, compensado pelo isolamento e pela resposta sem `details`.

### D4 — Ordem

#### Decision

`commentRateLimitMiddleware` → `commentAntiBotMiddleware` → `commentController.create`.

#### Reason

Rejeições anti-bot continuam contando no limitador de comentários (como erros de validação já contam); bot insistente leva 429. Limitador não duplicado/retunado/substituído (NFR-001).

#### Alternatives Considered

Não registradas pelo architect.

#### Trade-offs

Não registrados pelo architect.

### D5 — Contrato de rejeição

#### Decision

`400` com `{ "message": "Payload inválido." }`, SEM `details`, via `next(new HttpError(400, 'Payload inválido.'))`.

#### Reason

400 indistinguível de payload inválido comum (sem pista ao bot), coerente com contrato atual.

#### Alternatives Considered

- 403/422 — rejeitados: distinguíveis do payload inválido comum.
- 429 — rejeitado: `withRetryBackoff` do frontend reenvia em 429/5xx (4 tentativas) e confundiria com rate limit; 400 não é reenviado.
- 201 falso — rejeitado: AC-002 exige rejeição documentada.

#### Trade-offs

Não registrados pelo architect além do acima.

### D6 — Política de falha (FR-006/NFR-005)

#### Decision

Determinística, fail-closed para entrada malformada.

| Situação | Resultado |
|---|---|
| `body` não-objeto (`undefined`, `null`, array, string) | Passa adiante; controller/schema respondem o 400 de validação atual (contrato inalterado). |
| `website` ausente, ou só herdado via protótipo | Passa (checar só propriedade própria com `Object.prototype.hasOwnProperty.call` — `Object.hasOwn` é ES2022, target ES2020). |
| `website === ''` (comparação exata, SEM trim) | Passa. |
| Qualquer outro valor (string não vazia incl. só espaços, número, `null`, boolean, objeto, array) | Rejeita com 400 genérico (fail-closed). |

- Exceção inesperada no middleware: try/catch → `next(error)` → 500 genérico do error handler (sem stack).
- Sem provedor/timeout/configuração → modos "provedor indisponível"/"configuração ausente" N/A (documentar).
- Latência: checagem síncrona O(1).
- Logging: não registrar body nem valor do campo; recomendação é não logar.

#### Reason

Comportamento previsível e limitado (NFR-005); learning de variações adversariais / sem trim.

#### Alternatives Considered

Não registradas pelo architect.

#### Trade-offs

Não registrados pelo architect.

### D7 — Escopo (FR-007)

#### Decision

Coberto só `POST /works/{workId}/comments`.

#### Reason

`POST /auth/login` fora: uso exclusivo do admin, já protegido por `loginRateLimitMiddleware` (5/5 min por IP + hash do e-mail) e política de senha forte em produção (CARSHOP-105/108); honeypot ali exigiria mudar formulário admin sem ganho real contra brute force. Não há outras rotas públicas anônimas de escrita.

#### Alternatives Considered

Cobrir `POST /auth/login` — rejeitada (acima).

#### Trade-offs

Não registrados pelo architect além do acima.

### D8 — Ambiente

#### Decision

Nenhuma variável nova; `src/infra/config/env.ts` e `.env.example` não mudam; sem flag liga/desliga.

#### Reason

O mecanismo não exige configuração nem segredo. AC-007 N/A, documentado.

#### Alternatives Considered

Não registradas pelo architect.

#### Trade-offs

Não registrados pelo architect.

### D9 — Documentação

#### Decision

Criar `docs/anti-bot-policy.md`; atualizar `docs/api-contract.md` (seção `POST /works/{workId}/comments`); atualizar fragmento Swagger; bullet curto em "Segurança" do `README.md` com link.

#### Reason

FR-008, FR-009, AC-008, AC-009, AC-010.

#### Alternatives Considered

Não registradas pelo architect.

#### Trade-offs

Não registrados pelo architect.

## Execution Flow

```text
src/infra/config/routes.ts (/works)
    ↓
buildWorkRouter (src/infra/http/routes/work.routes.ts)
    ↓
commentRateLimitMiddleware (inalterado)
    ↓
commentAntiBotMiddleware (novo)
    ├── website ausente / '' / body não-objeto → next()
    └── qualquer outro valor → next(new HttpError(400, 'Payload inválido.'))
    ↓
CommentController.create
    ↓
validateWithSchema(createCommentSchema)  (website: z.literal('').optional())
    ↓
CreateCommentUseCase (inalterado; recebe só workId, authorName, content)
    ↓
CommentRepositoryPort.createPending (inalterado)
```

## Files

### Files to Create

- `src/infra/presentation/middleware/anti-bot.middleware.ts`, exportando:
  - `COMMENT_HONEYPOT_FIELD = 'website'` (const);
  - função pura `isHoneypotTriggered(body: unknown, fieldName: string): boolean` com regras D6;
  - `commentAntiBotMiddleware: RequestHandler` → `next()` ou `next(new HttpError(400, 'Payload inválido.'))`.
  - Regras: `import type` do Express; `HttpError` de `src/core/domain/application/ApplicationError/http-error`; nunca ler headers (incl. `User-Agent`); sem `any`; JSDoc pt-BR no estilo de `rate-limit.middleware.ts`.
- `docs/anti-bot-policy.md`, contendo:
  - endpoint coberto e não cobertos (justificativa login);
  - mecanismo em nível alto (campo de controle opcional que deve vir vazio, sem `User-Agent`);
  - ordem em relação aos limitadores e garantia de que não mudaram;
  - política de falha (tabela D6) e resposta de rejeição;
  - "Nenhuma variável de ambiente ou segredo é necessária.";
  - proporcionalidade e alternativas rejeitadas;
  - limitação conhecida e endurecimento futuro;
  - mudança recomendada no frontend (só documentar, AC-010/NFR-004): input `name="website"` visualmente oculto fora da tela (não `display:none`), `tabIndex={-1}`, `autoComplete="off"`, `aria-hidden="true"` no wrapper, rótulo tipo "Deixe este campo em branco" para tecnologias assistivas, enviar valor como está via `/api-proxy`, não reenviar em 400;
  - declaração de que usuário legítimo não interage com nada;
  - sem valores de env.
- Testes novos:
  - `test/unit/infra/presentation/middleware/anti-bot.middleware.spec.ts`
  - `test/unit/infra/docs/comments.swagger.spec.ts`
  - `test/e2e/comment-anti-bot.e2e-spec.ts`

### Files to Modify

- `src/infra/presentation/validators/comment.schema.ts`: adicionar `website: z.literal('').optional()` ao objeto `.strict()`; comentar que é campo de controle anti-automação, decisão do `commentAntiBotMiddleware`, schema é defesa em profundidade; chave deve bater com `COMMENT_HONEYPOT_FIELD` (garantir por teste); não mexer em mensagens/limites existentes.
- `src/infra/http/routes/work.routes.ts`: importar `commentAntiBotMiddleware`; `router.post('/:workId/comments', commentRateLimitMiddleware, commentAntiBotMiddleware, commentController.create)`; atualizar comentário da rota (CARSHOP-140).
- `src/infra/docs/comments.swagger.ts`: em `CommentRequest.properties` adicionar `website: { type: 'string', maxLength: 0, description: 'Campo de controle anti-automação. Deve ser omitido ou enviado como string vazia; qualquer outro valor resulta em 400.' }`; não incluir em `required`; texto neutro, sem a palavra "honeypot"; no `post`, `'400'` → `errorResponse('Payload inválido, inclusive requisições rejeitadas pela proteção anti-automação (sem campo details)')` ou equivalente; manter `'429'`.
- `docs/api-contract.md` seção `POST /works/{workId}/comments`: documentar `website` (opcional, vazio) e semântica do 400; opcional alinhar linha do `429` com o Swagger.
- `README.md`: um bullet em "Segurança" com link para `docs/anti-bot-policy.md`.
- Testes alterados:
  - `test/unit/infra/presentation/validators/comment.schema.spec.ts`
  - `test/unit/infra/http/routes/work.routes.spec.ts`
  - `test/unit/presentation/controllers/comment.controller.spec.ts`

### Files Not to Modify

- `src/presentation/controllers/comment.controller.ts` (já não repassa `website`, campo não persistido);
- use case, porta, repositório, model de comentário;
- `src/infra/server.ts`, `src/infra/config/routes.ts`, `src/infra/config/middleware.ts` (CORS), `src/infra/presentation/middleware/rate-limit.middleware.ts`;
- `src/infra/config/env.ts`, `.env.example`.

## Contract Impact

- Request `POST /works/{workId}/comments`: novo campo opcional `website` (string, deve ser `""`). Sem header novo, sem mudança de CORS.
- Respostas: 201 `CommentResponse` inalterada (AC-001); 400 validação continua `{message, details}`; 400 anti-bot `{message: 'Payload inválido.'}` sem `details`; 404 e 429 inalterados.
- Compatibilidade: retrocompatível.

## Persistence Impact

Nenhuma mudança; `website` nunca chega ao use case nem ao Mongo.

## Security Impact

- Sem segredos, sem log de body, sem header novo; error handler mantém 4 parâmetros.
- Decisão não lê headers (incl. `User-Agent`) — FR-004 por construção.
- Resposta de rejeição genérica, sem `details`, sem stack, sem nome de campo nem "honeypot".
- Limitadores `globalRateLimitMiddleware`, `commentRateLimitMiddleware`, `loginRateLimitMiddleware` inalterados (NFR-001).
- Nenhuma variável de ambiente nova (AC-007 N/A).

## Swagger Impact

- `src/infra/docs/comments.swagger.ts`: `CommentRequest.properties.website` (`type: 'string'`, `maxLength: 0`, descrição neutra, fora de `required`); resposta `'400'` do `post` atualizada para mencionar rejeição anti-automação sem `details`; `'429'` mantido.
- Drift Swagger `CommentRequest` (CARSHOP-124): re-verificar após a mudança.
- Verificação em `GET /docs.json` (AC-009).

## Testing Strategy

Novo `test/unit/infra/presentation/middleware/anti-bot.middleware.spec.ts`: ausente → `next()` sem argumento; `''` → `next()`; `'http://spam'` → `next(HttpError)` com `statusCode 400`, `message 'Payload inválido.'`, `details` undefined; `' '` → rejeita; não-string (`0`, `null`, `true`, `{}`, `[]`) → rejeita; `body` `undefined`/`null`/array/string → `next()`; `website` só no protótipo (`Object.create({website:'x'})`) → passa; AC-003: body legítimo com UA de navegador, `curl/8` e sem UA → aceita; AC-004: UA de navegador com honeypot preenchido → rejeita; mensagem do erro não contém `website` nem "honeypot"; testes diretos de `isHoneypotTriggered`.

`comment.schema.spec.ts`: aceita sem `website`; aceita `website: ''`; rejeita `website: 'x'`; continua rejeitando `isApproved`; chave aceita igual a `COMMENT_HONEYPOT_FIELD`.

`work.routes.spec.ts`: mockar `anti-bot.middleware` (`commentAntiBotMiddleware: 'comment-anti-bot-middleware'`); afirmar ordem `('/:workId/comments', 'comment-rate-limit-middleware', 'comment-anti-bot-middleware', Function)`.

`comment.controller.spec.ts`: caso com `website: ''` no body; use case recebe só `{workId, authorName, content}`.

Novo `test/unit/infra/docs/comments.swagger.spec.ts` (padrão `home-image.swagger.spec.ts`): `CommentRequest.properties.website` existe, `maxLength 0`, fora de `required`; `post` tem `400` e `429`.

Novo `test/e2e/comment-anti-bot.e2e-spec.ts`: setup no padrão de `comment-rate-limit.e2e-spec.ts` com `createApp({ imageStorage: new FakeImageStorageAdapter() })` e `resetKey` em `commentRateLimitMiddleware` e `globalRateLimitMiddleware` para chaves de loopback no `beforeEach`; não usar `X-Forwarded-For`. AC-001: sem `website` e com `website: ''` → 201 mesmo shape, `status` `PENDING`, `CommentModel.countDocuments({workId})` sobe. AC-002: `website` preenchido → 400 `{message:'Payload inválido.'}`, `details` indefinido, contagem inalterada. AC-003/AC-004: variações de `User-Agent`. AC-006: `website` número/objeto → 400; body serializado não contém `stack`, `website`, `honeypot` nem nome de env; 400 de validação comum (ex. `authorName` curto) continua com `details`. AC-005: após rejeições anti-bot, a 11ª requisição na janela leva 429 com mensagem existente; `comment-rate-limit.e2e-spec.ts` e `auth-login-rate-limit.e2e-spec.ts` passam sem alteração. AC-009: `GET /docs.json` contém `components.schemas.CommentRequest.properties.website` e `paths['/works/{workId}/comments'].post.responses['400']`.

Cobertura (>= 80% código novo/alterado conforme `.claude/rules/testing.md`): middleware novo ~100% (LH/LF); linhas alteradas em schema, rota e Swagger cobertas, medidas por `DA` × `git diff master`; sem exceção prevista.

Comandos: specs específicas primeiro; depois `npm test`, `npm run build`, `npm run test:e2e`, `npm run lint:check`, `npm run test:coverage`.

## Risks

- Proteção limitada até o frontend adotar o campo (limitação aceita e documentada).
- Falso positivo por autopreenchimento: baixo; mitigado pelas recomendações de frontend e comparação exata sem trim.
- Mecanismo descoberto por quem lê a doc: doc neutra; Swagger desligado por padrão em produção; honeypot não depende de sigilo forte; limitadores e moderação seguem como camadas principais.
- Defesa em profundidade: schema também rejeita `website` não vazio; em E2E a prova de que o middleware rodou é a ausência de `details`; comportamento isolado em unitários.
- Sem segredos, sem log de body, sem header novo; error handler mantém 4 parâmetros.

## Implementation Steps

1. Criar `src/infra/presentation/middleware/anti-bot.middleware.ts` (`COMMENT_HONEYPOT_FIELD`, `isHoneypotTriggered`, `commentAntiBotMiddleware`) conforme D6 e regras de "Files to Create".
2. Alterar `src/infra/presentation/validators/comment.schema.ts` adicionando `website: z.literal('').optional()`.
3. Alterar `src/infra/http/routes/work.routes.ts` para encadear `commentRateLimitMiddleware, commentAntiBotMiddleware, commentController.create`.
4. Atualizar `src/infra/docs/comments.swagger.ts` (`CommentRequest.properties.website`, resposta `400`, manter `429`).
5. Criar `docs/anti-bot-policy.md`; atualizar `docs/api-contract.md` e `README.md`.
6. Criar/alterar os testes listados em "Testing Strategy".
7. Executar specs específicas; depois `npm test`, `npm run build`, `npm run test:e2e`, `npm run lint:check`, `npm run test:coverage`.

## Definition of Done Mapping

| AC | Solução | Testes |
|---|---|---|
| AC-001 | Campo opcional, 201 inalterado | E2E, controller, schema |
| AC-002 | 400 sem `details`, sem persistência | Middleware unit, E2E `countDocuments` |
| AC-003 / AC-004 | Decisão não lê headers | Middleware unit, E2E variações de UA |
| AC-005 | Ordem rate limit → anti-bot, limitadores intactos | E2E 429, specs existentes sem alteração |
| AC-006 | Fail-closed para entrada malformada, 400 genérico | Middleware unit, E2E sem vazamento |
| AC-007 | N/A (sem configuração nova) | Declarado em `docs/anti-bot-policy.md` |
| AC-008 | `docs/anti-bot-policy.md`, `api-contract.md`, README | Revisão |
| AC-009 | Fragmento Swagger atualizado | Spec Swagger, E2E `/docs.json` |
| AC-010 | Seção frontend/UX/acessibilidade no doc | Revisão |
| AC-011 | Toda a suíte acima | — |
| AC-012 | N/A (nenhum endpoint adicional coberto) | Justificado em D7 |

## Open Non-Blocking Questions

- Perguntas bloqueantes: nenhuma.
- Questões de produto/frontend (6 e 7 do spec) registradas como recomendação em `docs/anti-bot-policy.md`, não bloqueiam o backend.
- Endurecimento futuro (fora de escopo): após o frontend sempre enviar `website: ""`, avaliar torná-lo obrigatório em outra tarefa.
