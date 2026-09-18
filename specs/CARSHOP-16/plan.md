# CARSHOP-16 — Implementation Plan

## Source

Specification:
`specs/CARSHOP-16/spec.md`

## Architect Verdict

READY FOR IMPLEMENTATION

## Objective

Impedir que os campos `authorName`/`content` de `POST /works/{workId}/comments`
persistam markup HTML ou construções de script (tags, atributos `on*=`,
URIs `javascript:`, entidades que codificam `<`/`>`), rejeitando a
submissão com `4xx` no mesmo mecanismo de erro de validação já usado para
os limites de tamanho, sem alterar rota, método, nomes de campos, formato
de resposta ou as regras de tamanho/trim existentes (FR-001–FR-005,
AC-001–AC-007, NFR-001–NFR-003).

## Current Architecture

Fluxo confirmado: rota pública de comentários → `CommentController.create`
→ `validateWithSchema(createCommentSchema, req.body)` (lança
`HttpError(400, 'Payload inválido.', z.flattenError(result.error))`) →
`CreateCommentUseCase.execute` → `CommentRepositoryPort` → `CommentModel`.

`createCommentSchema` tem `.strict()`, `trim()`, `min`/`max`
(`authorName` 2-80, `content` 3-1000). `z.flattenError` não ecoa o valor
bruto enviado, apenas mensagens — desde que a mensagem do novo `.refine()`
seja estática, não há vazamento; `error-handler.middleware.ts` não precisa
mudar. `CreateCommentUseCase` não faz sanitização (apenas trim/persist).
`CommentModel` tem `maxlength` espelhando o Zod, sem hooks relevantes.
`comments.swagger.ts` já tem `400: errorResponse('Payload inválido')`
genérico. Não há `sanitize-html` nem lib equivalente em `package.json`.

## Proposed Solution

Detectar markup HTML/script via regex inline encadeada em `.refine()` no
próprio `createCommentSchema`, sem introduzir nova dependência, seguindo o
padrão "Inline Zod Validation" já existente no repositório.

Novo arquivo: `src/infra/presentation/validators/html-content.guard.ts`

- Exporta `containsHtmlOrScriptMarkup(value: string): boolean`.
- 4 padrões independentes (retorna `true` se qualquer casar):
  1. `HTML_TAG_PATTERN` ~ `/<\/?[a-zA-Z][\w-]*(\s[^<>]*)?>/` — detecta tags
     de abertura/fechamento (cobre `<script>`, `<img onerror=...>`,
     `<div onclick=...>`, `<a href="javascript:...">`), sem confundir
     `<`/`>` soltos em prosa (ex: "5 < 10 segundos").
  2. `HTML_ENCODED_ANGLE_BRACKET_PATTERN` — entidades nomeadas/numéricas
     para `<`/`>` (`&lt;`, `&gt;`, `&#60;`, `&#62;`, `&#x3c;`, `&#x3e;`,
     case-insensitive).
  3. `EVENT_HANDLER_ATTRIBUTE_PATTERN` — `/\bon[a-z]+\s*=/i`.
  4. `JAVASCRIPT_URI_PATTERN` — `/javascript\s*:/i`.

Arquivo modificado: `src/infra/presentation/validators/comment.schema.ts`

- Importar `containsHtmlOrScriptMarkup`.
- Encadear
  `.refine((value) => !containsHtmlOrScriptMarkup(value), { message: 'Campo não pode conter marcação HTML ou conteúdo de script.' })`
  em `authorName` E `content`, após o `.max()` de cada campo (aplicado por
  campo, preserva `.strict()` e mensagens por campo).
- Mensagem estática, sem interpolar input.
- Refine roda após `.trim()`.

## Technical Decisions

### Decision

Usar regex/deny-list inline via Zod `.refine()` em
`html-content.guard.ts` + `comment.schema.ts`, sem introduzir dependência
nova.

### Reason

Zero dependência nova, mantém o padrão "Inline Zod Validation" já
utilizado no repositório, é testável isoladamente e determinístico. O
spec exige rejeição `4xx` (não transformação/stripping de markup), o que
descarta abordagens de sanitização/transformação.

### Alternatives Considered

Biblioteca como `sanitize-html` — rejeitada por violar
`.claude/rules/typescript.md` ("não adicionar dependência quando a
existente resolve") e por o spec exigir rejeição com `4xx`, não
transformação/stripping do conteúdo.

### Trade-offs

- Falsos positivos possíveis com `EVENT_HANDLER_ATTRIBUTE_PATTERN` em
  palavras raras "on...=" fora de contexto de tag — aceito como trade-off
  documentado.
- Regex é aproximação, não parser HTML formal — suficiente para
  FR-001/FR-002/AC-001–AC-007, não uma sanitização HTML completa.

## Execution Flow

1. Criar `src/infra/presentation/validators/html-content.guard.ts` com
   `containsHtmlOrScriptMarkup` e os 4 padrões de detecção.
2. Modificar `src/infra/presentation/validators/comment.schema.ts` para
   encadear `.refine()` em `authorName` e `content`, usando o guard.
3. Atualizar `src/infra/docs/comments.swagger.ts` com `description`
   explicando a rejeição de markup HTML/script em `authorName`/`content`
   do `CommentRequest`.
4. Criar `test/unit/infra/presentation/validators/html-content.guard.spec.ts`.
5. Estender `test/unit/infra/presentation/validators/comment.schema.spec.ts`.
6. Estender `test/unit/presentation/controllers/comment.controller.spec.ts`.
7. Rodar os testes específicos, depois `npm test` e `npm run build`.

## Files

### Files to Create

- `src/infra/presentation/validators/html-content.guard.ts`
- `test/unit/infra/presentation/validators/html-content.guard.spec.ts`

### Files to Modify

- `src/infra/presentation/validators/comment.schema.ts`
- `src/infra/docs/comments.swagger.ts`
- `test/unit/infra/presentation/validators/comment.schema.spec.ts`
- `test/unit/presentation/controllers/comment.controller.spec.ts`

### Files Not Changed (Reference)

- `src/presentation/controllers/comment.controller.ts` — sem alteração.
- `src/usecase/create-comment.use-case.ts` — sem alteração.
- `src/data/models/comment.model.ts` — sem alteração.
- `src/infra/presentation/middleware/error-handler.middleware.ts` — sem
  alteração (verificado que não há vazamento de payload).
- `src/infra/presentation/validators/update-comment.schema.ts` — fora de
  escopo, risco residual (ver seção Riscos).

## Contract Impact

Nenhuma mudança de rota, método, nomes de campos ou formato de resposta
para submissões aceitas. O único efeito observável novo é a rejeição
`4xx` (mesmo mecanismo de erro já usado para os limites de tamanho)
quando `authorName`/`content` contiverem markup HTML/script. A resposta
`400` genérica já existente (`errorResponse('Payload inválido')`) cobre o
novo caso; nenhum novo status ou schema de erro é introduzido.

## Persistence Impact

Nenhuma. `CommentModel` não é alterado; a rejeição ocorre na camada de
validação, antes de qualquer persistência via `CreateCommentUseCase`.

## Security Impact

Fecha um risco de stored/persistent XSS: hoje `authorName`/`content` só
são validados por tamanho, sem checagem de markup HTML/script. A nova
checagem garante, no backend, que nenhum comentário contendo tais
construções seja persistido ou retornado pela API (NFR-001), sem depender
do frontend para proteção. Mensagem de erro do `.refine()` é estática
(não interpola o input), evitando vazamento de payload bruto via
`z.flattenError`.

## Swagger Impact

- `src/infra/docs/comments.swagger.ts`: adicionar `description` em
  `authorName`/`content` de `CommentRequest` explicando a rejeição de
  markup HTML/script (texto em prosa, sem tentar espelhar a regex como
  `pattern` de JSON Schema).
- Resposta `400` genérica já existente cobre o novo caso; não é necessário
  novo status ou schema.

## Testing Strategy

1. NOVO
   `test/unit/infra/presentation/validators/html-content.guard.spec.ts` —
   testa `containsHtmlOrScriptMarkup` isoladamente: AC-001
   (`<script>alert(1)</script>`) → `true`; AC-002
   (`<img src=x onerror=alert(1)>`) → `true`; AC-003
   (`<div onclick="alert(1)">hi</div>`) → `true`; AC-004
   (`<a href="javascript:alert(1)">click</a>`) → `true`; entidade
   `&lt;script&gt;` → `true`; texto plano AC-005 (`"Ótimo trabalho, ficou
   excelente!"`, `"Maria Silva"`) → `false`; caso limite `"5 < 10
   segundos"` → `false`.
2. MODIFICAR
   `test/unit/infra/presentation/validators/comment.schema.spec.ts` —
   casos via `createCommentSchema.safeParse(...)` espelhando
   AC-001–AC-004, mais aceitação de texto plano (AC-005) e confirmação de
   que a validação de tamanho (AC-006) permanece inalterada.
3. MODIFICAR
   `test/unit/presentation/controllers/comment.controller.spec.ts` — caso
   com `content` contendo `<script>...</script>`: `next` chamado com erro
   `400` E `createCommentUseCase.execute` NÃO chamado (prova FR-003).
4. Recomendação ao tester (não bloqueante para este plano): estender o
   e2e existente da rota de comentários com payload de ataque (AC-001) →
   `4xx`, nenhum comentário criado; e caso de aceitação plana (AC-005).

Mudança pequena e totalmente unit-testável (função pura + `.refine()`
determinístico), sem I/O — a meta de cobertura `>= 80%` de código
novo/alterado definida em `.claude/rules/testing.md` é atingível com
folga pelos casos acima, cobrindo todos os ramos dos 4 padrões de
detecção. Nenhuma exceção é necessária.

Rodar os arquivos de teste específicos, depois `npm test` e
`npm run build`.

## Risks

- `update-comment.schema.ts` (edição admin via
  `admin-comment.controller.ts`) NÃO recebe a mesma checagem — fora do
  escopo do spec (que cobre apenas o fluxo de criação pública). Risco
  residual: admin mal-intencionado ou edição pós-aprovação pode
  reintroduzir markup. Recomendação: abrir tarefa de acompanhamento no
  Notion (mudança de requisito, não decisão de implementação).
- Sem migração retroativa de comentários já persistidos (Out of Scope no
  spec).
- Falsos positivos possíveis com `EVENT_HANDLER_ATTRIBUTE_PATTERN` em
  palavras raras "on...=" fora de contexto de tag — aceito como trade-off
  documentado.
- Regex é aproximação, não parser HTML formal — suficiente para o escopo
  atual, não uma sanitização HTML completa.

## Implementation Steps

1. Criar `html-content.guard.ts` com `containsHtmlOrScriptMarkup` e os 4
   padrões de detecção.
2. Encadear `.refine()` em `authorName` e `content` no
   `comment.schema.ts`.
3. Atualizar `comments.swagger.ts` com as novas `description`.
4. Criar `html-content.guard.spec.ts` cobrindo os casos descritos.
5. Estender `comment.schema.spec.ts` e `comment.controller.spec.ts`.
6. Rodar os testes específicos, depois `npm test` e `npm run build`.
7. (Recomendação não bloqueante) Estender o e2e de comentários com
   AC-001 e AC-005.

## Definition of Done Mapping

- FR-001 → AC-001, AC-002, AC-007 → coberto por
  `html-content.guard.spec.ts` e `comment.schema.spec.ts`.
- FR-002 → AC-001, AC-002, AC-003, AC-004, AC-007 → coberto por
  `html-content.guard.spec.ts` e `comment.schema.spec.ts`.
- FR-003 → AC-001, AC-002, AC-003, AC-004 → coberto por
  `comment.controller.spec.ts` (erro 400 e use case não chamado).
- FR-004 → AC-006 → coberto por `comment.schema.spec.ts` (validação de
  tamanho inalterada).
- FR-005 → AC-005 → coberto por `comment.schema.spec.ts` e
  `html-content.guard.spec.ts` (texto plano aceito).
- NFR-001 → AC-007 → checagem centralizada no backend, independente de
  frontend.
- NFR-002 → AC-005, AC-006 → sem alteração de rota/método/nomes de
  campos/resposta.
- NFR-003 → AC-001, AC-002, AC-003, AC-004 → lógica centralizada em
  `html-content.guard.ts`, usada a partir de `comment.schema.ts`.

## Open Non-Blocking Questions

- Whether a bare `<`/`>` character used in ordinary prose (not forming a
  tag-like construct) should be rejected or preserved as plain text —
  resolvido pela implementação escolhida (`HTML_TAG_PATTERN` exige forma
  de tag), sem contradizer AC-001–AC-007.
- Extensão futura da mesma checagem para `update-comment.schema.ts`
  (edição admin) fica registrada como risco residual, a ser tratada como
  possível tarefa de acompanhamento no Notion.
