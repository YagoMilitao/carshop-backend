# CARSHOP-136 — Implementar endpoint admin para listar comentários por status

## Status

Ready

## Source

Notion Task:
CARSHOP-136

## Context

O frontend administrativo (CARSHOP-35) precisa de uma tela de moderação
que liste comentários e permita filtrá-los por status (`PENDING`,
`APPROVED`, `HIDDEN`). O backend já expõe endpoints administrativos de
moderação — `PATCH /admin/comments/{commentId}/approve`,
`PATCH /admin/comments/{commentId}` e `DELETE /admin/comments/{commentId}`
(conforme o contrato consolidado em CARSHOP-124) — mas não existe nenhum
`GET` administrativo capaz de listar comentários para moderação.

O único endpoint de leitura de comentários hoje é público —
`GET /works/{workId}/comments` — e retorna exclusivamente comentários com
status `APPROVED`, escopado a um único `work`. Ele não atende à
necessidade de moderação (listar comentários pendentes/ocultos, sem
escopo obrigatório por `work`) e, por requisito explícito da tarefa, não
deve ser reaproveitado para esse fim.

Esta especificação define o endpoint administrativo ausente,
complementando o contrato já documentado em CARSHOP-124.

## Objective

Disponibilizar um endpoint administrativo autenticado,
`GET /admin/comments`, que permita ao frontend de moderação (CARSHOP-35)
listar comentários filtrando por status, com ordenação determinística e
paginação, retornando apenas os dados necessários para a tela de
moderação.

## Functional Requirements

- FR-001: Deve existir o endpoint `GET /admin/comments`, protegido pelo
  mesmo mecanismo de autenticação Bearer/JWT já usado nas demais rotas
  administrativas de comentários (`authMiddleware`), em uma rota
  administrativa distinta do endpoint público
  `GET /works/{workId}/comments`.
- FR-002: O endpoint deve aceitar um parâmetro de query opcional para
  filtrar comentários por status, aceitando exatamente os valores
  `PENDING`, `APPROVED` e `HIDDEN`.
- FR-003: Quando o filtro de status não for informado, o endpoint deve
  listar comentários independentemente do status (todos os status
  suportados), permitindo uma visão geral da moderação.
- FR-004: Quando um valor de status inválido (fora do conjunto `PENDING`,
  `APPROVED`, `HIDDEN`) for informado, o endpoint deve rejeitar a
  requisição sem consultar a base de dados.
- FR-005: O endpoint deve retornar os comentários em uma ordenação
  determinística e consistente entre requisições equivalentes,
  preferencialmente do mais recente para o mais antigo, para que a
  tela de moderação apresente uma ordem previsível.
- FR-006: O endpoint deve suportar paginação (ou, alternativamente,
  demonstrar de forma justificada por que a paginação não é necessária
  para o volume de dados atual do domínio), seguindo os padrões já
  estabelecidos nas demais rotas de listagem do backend. A forma
  concreta de paginação (parâmetros, formato de resposta, tamanho de
  página padrão/máximo) é uma decisão de implementação, não desta
  especificação.
- FR-007: A resposta de cada comentário deve conter os campos
  necessários para a tela de moderação (ao menos: identificador,
  identificador do `work` associado, nome do autor, conteúdo, status,
  data de criação e data de atualização), reaproveitando o formato de
  `Comment`/`CommentResponse` já usado pelos demais endpoints de
  comentários, sem expor dados internos desnecessários (ex.: nenhum
  detalhe de infraestrutura de persistência).
- FR-008: O endpoint deve responder `401` quando a requisição não
  contiver um Bearer token válido, seguindo o mesmo comportamento já
  adotado pelas demais rotas de `/admin/comments`.
- FR-009: O endpoint deve responder `400` quando o parâmetro de status
  informado não pertencer ao conjunto de valores válidos.
- FR-010: A documentação Swagger/OpenAPI (`src/infra/docs/*.swagger.ts`)
  deve ser atualizada para refletir o novo endpoint: método, path,
  parâmetros de query, formato de resposta de sucesso, códigos de erro
  relevantes (`400`, `401`) e exigência de autenticação Bearer.
- FR-011: O documento de contrato de API já existente para o frontend
  (`docs/api-contract` / artefato equivalente produzido em CARSHOP-124)
  deve ser atualizado para incluir `GET /admin/comments`, de forma
  consistente com o restante do documento.

## Non-Functional Requirements

- NFR-001: O endpoint deve seguir o padrão arquitetural já usado pelas
  demais rotas administrativas: controller fino, regra de negócio em um
  use case dedicado, acesso a dados através do
  `CommentRepositoryPort` existente (ou de uma extensão explícita e
  justificada dele), sem acoplar a camada de domínio/use case a Express
  ou Mongoose.
- NFR-002: A validação do parâmetro de status (e de eventuais parâmetros
  de paginação) deve ocorrer na camada de apresentação, usando o
  mecanismo de validação com Zod já padronizado no projeto
  (`validateWithSchema`), consistente com os demais endpoints do
  backend.
- NFR-003: O endpoint não deve expor nenhum dado de outro comentário além
  dos campos definidos em FR-007, nem dados de outras entidades além do
  identificador do `work` associado.
- NFR-004: A alteração não pode enfraquecer nem alterar o comportamento
  de autenticação, CORS, CSRF, cookies ou dos endpoints administrativos
  de comentários já existentes (`approve`, `update`, `delete`).
- NFR-005: Testes unitários e E2E devem cobrir autenticação (ausência de
  token e token válido), os três valores de filtro de status, o
  comportamento sem filtro, a rejeição de valor de status inválido, e o
  formato do payload retornado, seguindo `.claude/rules/testing.md`.

## Acceptance Criteria

- AC-001: Uma requisição `GET /admin/comments` sem header `Authorization`
  retorna `401`.
- AC-002: Uma requisição `GET /admin/comments` com Bearer token válido e
  sem parâmetro de status retorna `200` com uma lista de comentários.
- AC-003: Uma requisição `GET /admin/comments?status=PENDING` com Bearer
  token válido retorna `200` contendo apenas comentários com status
  `PENDING`.
- AC-004: Uma requisição `GET /admin/comments?status=APPROVED` com Bearer
  token válido retorna `200` contendo apenas comentários com status
  `APPROVED`.
- AC-005: Uma requisição `GET /admin/comments?status=HIDDEN` com Bearer
  token válido retorna `200`, filtrando corretamente por status
  `HIDDEN` quando esse status existir em comentários persistidos.
- AC-006: Uma requisição `GET /admin/comments?status=<valor-invalido>`
  retorna `400`, sem alterar nem consultar dados de comentários.
- AC-007: Os itens retornados pelo endpoint aparecem em ordem
  determinística (mais recente primeiro) em requisições repetidas com os
  mesmos parâmetros e sem alteração de dados entre elas.
- AC-008: Cada item retornado contém, no mínimo, identificador do
  comentário, identificador do `work`, nome do autor, conteúdo, status,
  data de criação e data de atualização, e não contém campos de
  infraestrutura de persistência (ex.: identificadores internos do
  Mongoose além do `id` de domínio já usado pelo restante da API).
- AC-009: O fragmento Swagger correspondente documenta
  `GET /admin/comments`, incluindo parâmetros de query, respostas de
  sucesso e erro, e a exigência de Bearer token.
- AC-010: O documento de contrato de API (`docs/api-contract` /
  equivalente de CARSHOP-124) é atualizado para incluir
  `GET /admin/comments`.
- AC-011: Nenhum teste ou comportamento existente dos endpoints
  `PATCH /admin/comments/{commentId}/approve`,
  `PATCH /admin/comments/{commentId}` e
  `DELETE /admin/comments/{commentId}` é alterado ou quebrado pela
  implementação desta tarefa.

## Constraints

- O endpoint público `GET /works/{workId}/comments` não deve ser
  reaproveitado, estendido ou ter seu comportamento alterado para
  atender a este requisito; o novo endpoint deve ser uma rota
  administrativa distinta e autenticada.
- A forma exata de paginação (parâmetros, formato da resposta, valores
  padrão/máximo de página) não é definida por esta especificação; deve
  ser decidida pelo architect com base nos padrões já existentes no
  repositório (ou na ausência deles, conforme observado nesta
  especificação).
- O conjunto de campos exposto na resposta deve derivar do tipo de
  domínio `Comment` já existente (`src/core/domain/application/Work/work.types.ts`)
  e do mapeamento já usado pelos demais endpoints de comentários, não de
  uma estrutura nova e divergente.
- Toda alteração em `src/infra/docs/*.swagger.ts` e no documento de
  contrato de API deve refletir fielmente o comportamento real
  implementado, sem descrever contrato não entregue.

## Dependencies

- `src/data/models/comment.model.ts` e o
  `CommentRepositoryPort` (`src/core/domain/repositories/comment.repository.ts`)
  existentes — a listagem deve reaproveitar essa base de persistência.
- `authMiddleware` (CARSHOP-2 / autenticação JWT) já usado pelas demais
  rotas de `/admin/comments`.
- Endpoints administrativos de moderação já implementados
  (`approve`/`update`/`delete`), conforme consolidado em CARSHOP-124 —
  o novo endpoint deve seguir o mesmo padrão de rota, controller e
  composição.
- Documento de contrato de API produzido em CARSHOP-124
  (`specs/CARSHOP-124/api-contract.md` ou equivalente), que precisa ser
  atualizado por esta tarefa.
- CARSHOP-35 (frontend) — consumidor final deste endpoint; a tarefa é
  considerada útil quando CARSHOP-35 conseguir listar e filtrar
  comentários usando o endpoint real.

## Out of Scope

- Qualquer alteração de comportamento dos endpoints já existentes de
  moderação (`approve`, `update`, `delete`) além do necessário para
  reaproveitar padrões de composição.
- Qualquer alteração no endpoint público `GET /works/{workId}/comments`.
- Definir ou implementar, nesta tarefa, um fluxo de UI ou lógica de
  frontend (CARSHOP-35) — esta especificação cobre apenas o contrato e o
  comportamento do backend.
- Introduzir um novo mecanismo de autenticação ou autorização distinto
  do já existente para rotas administrativas.

## Risks

- O tipo de domínio atual `CommentStatus`
  (`src/core/domain/application/Work/work.types.ts`) e o schema Mongoose
  (`src/data/models/comment.model.ts`) atualmente só definem os valores
  `PENDING` e `APPROVED`; o valor `HIDDEN` não existe em nenhum ponto do
  domínio, persistência ou nos endpoints de escrita já implementados
  (`UpdateCommentRepositoryInput.status` também só aceita `PENDING` e
  `APPROVED`). Isso significa que, hoje, nenhum comentário pode ser
  colocado em status `HIDDEN` através de um caminho de escrita
  existente. O architect precisa avaliar se esta tarefa deve estender o
  domínio/persistência para suportar `HIDDEN` como um valor de status
  válido (ao menos para fins de filtro determinístico e consistente com
  o contrato), ou se essa extensão pertence a uma tarefa separada — ver
  Open Questions.
- Ausência de um padrão de paginação já estabelecido no repositório
  (`GET /works` não pagina; apenas alterna entre `listPublished` e
  `listAll`) aumenta a chance de o architect precisar propor um padrão
  novo, que passará a ser referência para futuros endpoints de listagem.
- Exposição acidental de dados internos de persistência (ex.: campos do
  documento Mongoose) caso o mapeamento de resposta não reaproveite o
  tipo de domínio `Comment` já existente.

## Open Questions

### Blocking

Nenhuma.

### Non-blocking

- Se o suporte ao status `HIDDEN` deve ser estendido ao domínio/
  persistência nesta própria tarefa (para que o filtro `HIDDEN` tenha
  efeito prático e testável) ou se essa tarefa deve apenas aceitar o
  valor no filtro, sem que nenhum comentário real possa assumir esse
  status ainda — cabe ao architect decidir com base no restante do
  contrato administrativo e no Definition of Done desta tarefa (que
  afirma explicitamente que "Filtering by PENDING, APPROVED, and HIDDEN
  works").
- Formato exato da paginação (page/limit, cursor, ou ausência de
  paginação com justificativa) — não especificado pelo Notion; decisão
  do architect, a partir da inspeção dos padrões de listagem já
  existentes no repositório.
- Conjunto exato de campos da resposta além do mínimo definido em FR-007
  — decisão do architect, alinhada ao tipo de domínio `Comment` e ao
  mapeamento já usado em outros endpoints de comentários.
- Tamanho de página padrão/máximo — não informado pelo Notion; decisão
  do architect.

## Traceability

FR-001 → AC-001, AC-002
FR-002 → AC-003, AC-004, AC-005
FR-003 → AC-002
FR-004 → AC-006
FR-005 → AC-007
FR-006 → AC-002
FR-007 → AC-008
FR-008 → AC-001
FR-009 → AC-006
FR-010 → AC-009
FR-011 → AC-010
NFR-001 → AC-011
NFR-002 → AC-006
NFR-003 → AC-008
NFR-004 → AC-011
NFR-005 → AC-001, AC-002, AC-003, AC-004, AC-005, AC-006
