# CARSHOP-127 — Validar tamanho do campo alt no upload de imagem de work

## Status

Ready

## Source

Notion Task:
CARSHOP-127

## Context

`POST /admin/works/{workId}/images` aceita o campo `alt` (multipart) sem
limite de tamanho no schema Zod HTTP
(`src/infra/presentation/validators/upload-work-image-body.schema.ts`),
embora o schema Mongoose (`src/data/models/work.model.ts`) declare
`maxlength: 160` para esse mesmo campo.

Como a persistência da imagem usa `WorkModel.updateOne()` com `$push`
(sem `runValidators: true`), o Mongoose não aplica esse limite nessa
operação específica: um `alt` maior que 160 caracteres é aceito e
persistido silenciosamente, sem truncamento e sem erro, retornando `201`
normalmente. Isso diverge do limite já declarado no schema Mongoose e do
comportamento esperado pelo contrato da API.

Esta divergência foi encontrada durante a revisão do contrato de API
(CARSHOP-122), pela pipeline de review Codex, e confirmada manualmente
contra o código.

## Objective

Alinhar a validação HTTP do campo `alt` do upload de imagem de work ao
limite de 160 caracteres já declarado no schema Mongoose, rejeitando com
`400` qualquer requisição cujo `alt` exceda esse limite, sem alterar o
schema Mongoose nem a estratégia de persistência (`updateOne`/`$push`).

## Functional Requirements

- FR-001: Ao processar `POST /admin/works/{workId}/images`, se o campo
  `alt` (multipart) estiver presente e seu comprimento exceder 160
  caracteres, a requisição deve ser rejeitada com status `400` e uma
  mensagem de erro clara, sem persistir a imagem.
- FR-002: Ao processar `POST /admin/works/{workId}/images`, se o campo
  `alt` estiver presente e seu comprimento for menor ou igual a 160
  caracteres, a requisição deve continuar sendo aceita e processada
  normalmente (comportamento atual preservado).
- FR-003: Ao processar `POST /admin/works/{workId}/images`, se o campo
  `alt` estiver ausente, a requisição deve continuar sendo aceita
  normalmente (campo é opcional, comportamento atual preservado).
- FR-004: A mensagem de erro retornada para `alt` acima do limite deve
  seguir o padrão de erro de validação já existente no projeto
  (Zod + `validateWithSchema` + `error-handler.middleware.ts`), sem
  introduzir um novo formato de resposta de erro.
- FR-005: `docs/api-contract.md` deve refletir o limite de 160 caracteres
  do campo `alt` no upload de imagem de work, alinhado ao comportamento
  HTTP corrigido.
- FR-006: O fragmento Swagger correspondente ao upload de imagem de work
  (`src/infra/docs/*.swagger.ts`) deve documentar o limite de 160
  caracteres do campo `alt` e o novo caso de resposta `400` associado a
  essa validação, quando esse fragmento já documenta parâmetros/erros do
  endpoint.

## Non-Functional Requirements

- NFR-001 (Manutenibilidade): A correção deve ser aplicada
  exclusivamente na camada de validação HTTP (Zod), sem alterar o schema
  Mongoose (`src/data/models/work.model.ts`) nem introduzir
  `runValidators: true` em `updateOne`/`$push` — essa seria uma decisão
  arquitetural fora do escopo desta tarefa.
- NFR-002 (Compatibilidade): Nenhum outro campo do upload de imagem
  (`isCover`, arquivo da imagem) ou de outros endpoints de work deve ter
  seu comportamento de validação alterado por esta tarefa.

## Acceptance Criteria

- AC-001: Uma requisição `POST /admin/works/{workId}/images` com `alt`
  contendo 161 caracteres ou mais retorna `400` com uma mensagem de erro
  que identifica o campo `alt` e o limite violado, seguindo o padrão de
  erro de validação já existente no projeto.
- AC-002: Uma requisição `POST /admin/works/{workId}/images` com `alt`
  contendo até 160 caracteres retorna `201` e persiste a imagem
  normalmente, sem regressão em relação ao comportamento atual.
- AC-003: Uma requisição `POST /admin/works/{workId}/images` sem o campo
  `alt` continua retornando `201` normalmente (campo opcional
  preservado).
- AC-004: Existe teste unitário cobrindo o schema Zod do body do upload
  de imagem (`upload-work-image-body.schema.ts`) validando os dois
  cenários: `alt` acima do limite (rejeitado) e `alt` dentro do limite
  (aceito).
- AC-005: `docs/api-contract.md` documenta explicitamente o limite de 160
  caracteres para o campo `alt` no endpoint de upload de imagem de work.

## Constraints

- A correção deve ser aplicada apenas em
  `src/infra/presentation/validators/upload-work-image-body.schema.ts`
  (camada de validação HTTP), sem alterar `src/data/models/work.model.ts`
  nem a chamada `updateOne`/`$push` usada para persistir a imagem.
- O escopo é estritamente o campo `alt` do upload de imagem
  (`POST /admin/works/{workId}/images`); não deve ser confundido com
  CARSHOP-128 (branch/tarefa separada), que trata de limites de campos de
  "work" em geral.
- Nenhum valor real de ambiente, segredo, credencial ou dado de produção
  pode ser incluído em nenhum artefato desta especificação
  (`.claude/rules/spec-security.md`).
- A URL base da API é fornecida via configuração de ambiente (`API_URL`);
  esta especificação não fixa nenhum valor concreto de ambiente.
- Requisições autenticadas usam a estratégia existente de Bearer token do
  projeto; nenhum valor de token faz parte desta especificação.

## Dependencies

- `src/infra/presentation/validators/upload-work-image-body.schema.ts` —
  schema Zod a ser alterado.
- `src/data/models/work.model.ts` — declara `maxlength: 160` para `alt`,
  referência do limite a ser espelhado na validação HTTP.
- `src/presentation/helpers/route-param.helper.ts` /
  `validateWithSchema` — padrão de validação e erro já existente no
  projeto, a ser reutilizado.
- `src/infra/presentation/middleware/error-handler.middleware.ts` —
  padrão de resposta de erro central.
- `docs/api-contract.md` — documento a ser atualizado.
- CARSHOP-122 — tarefa de origem que documentou o contrato de API e
  identificou esta divergência.

## Out of Scope

- Alterar o schema Mongoose (`work.model.ts`) ou introduzir
  `runValidators: true` na operação `updateOne`/`$push` — decisão
  arquitetural explicitamente fora do escopo, a ser avaliada
  separadamente se necessária.
- Limites de campos de "work" em geral (título, descrição, meta tags
  etc.) — tratados por CARSHOP-128, tarefa separada.
- Qualquer mudança no comportamento do campo `isCover` ou no processo de
  upload/armazenamento da imagem em si (Cloudinary).

## Risks

- Divergir do comportamento definido pelo Mongoose caso o limite exato
  (160) não seja mantido em sincronia entre os dois schemas no futuro.
- Introduzir uma mensagem de erro inconsistente com o padrão de erro já
  usado pelo restante da API, caso não se reutilize
  `validateWithSchema`/`error-handler.middleware.ts`.

## Open Questions

### Blocking

Nenhuma.

### Non-blocking

- Mensagem de erro exata não especificada literalmente pela tarefa
  original (apenas "mensagem clara"); seguir o padrão de erro Zod +
  `validateWithSchema` já existente no projeto.

## Traceability

FR-001 → AC-001
FR-002 → AC-002
FR-003 → AC-003
FR-004 → AC-001
FR-005 → AC-005
FR-006 → AC-001, AC-005
NFR-001 → AC-001, AC-002
NFR-002 → AC-002, AC-003
