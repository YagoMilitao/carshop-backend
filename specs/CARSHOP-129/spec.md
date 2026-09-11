# CARSHOP-129 — Corrigir consistência do hard-delete de work em falha parcial de remoção de imagens

## Status

Ready

## Source

Notion Task:
CARSHOP-129

## Context

`HardDeleteWorkUseCase` (`src/usecase/hard-delete-work.use-case.ts`) remove
as imagens de um work no storage externo (Cloudinary) sequencialmente, uma
por uma, antes de remover o work no MongoDB.

Se a remoção da imagem N falhar (após as imagens `1..N-1` já terem sido
removidas com sucesso do storage externo), a operação aborta hoje com `502`
sem qualquer compensação: as imagens já removidas do storage externo não
são restauradas, e o work permanece no MongoDB referenciando arquivos que
não existem mais, até uma nova tentativa bem-sucedida.

O JSDoc atual do use case afirma que a ordem de remoção (imagens antes do
Mongo) "evita registros órfãos" — essa afirmação está incorreta/desatualizada
frente ao comportamento real descrito acima e deve ser corrigida,
independentemente da estratégia de consistência escolhida.

Esta divergência foi encontrada durante a revisão do contrato de API
(CARSHOP-122), pela pipeline de review Codex, e confirmada manualmente
contra o código.

## Objective

Garantir que, em caso de falha parcial na remoção de imagens durante o hard
delete de um work, o sistema apresente um comportamento consistente,
observável e documentado — tanto para o estado resultante no MongoDB e no
storage externo quanto para a resposta HTTP retornada ao cliente — e que a
documentação (código e `docs/api-contract.md`) reflita esse comportamento
real.

A definição da estratégia técnica exata (por exemplo, retry idempotente,
registro/sinalização de imagens já removidas, ou outra abordagem
tecnicamente adequada) é responsabilidade do `architect` na fase seguinte
do workflow e não é prescrita por esta especificação.

## Functional Requirements

- FR-001: Ao executar o hard delete de um work cujas imagens não removem
  todas com sucesso do storage externo (ao menos uma remoção falha após
  outras já terem sido removidas com sucesso), o sistema deve produzir um
  estado final consistente e determinístico para o work e suas imagens —
  ou seja, o estado do work no MongoDB (existente/removido, e sua lista de
  imagens) e o estado das imagens no storage externo devem ser
  reconciliáveis entre si segundo uma regra documentada, sem depender de
  reexecuções manuais fora do fluxo da API para alcançar esse estado.
- FR-002: A resposta HTTP retornada ao cliente quando ocorre falha parcial
  na remoção de imagens deve refletir corretamente o resultado real da
  operação (sucesso, falha ou sucesso parcial), sem indicar sucesso total
  quando o work ou alguma imagem permanecer em estado inconsistente, e sem
  indicar falha total quando a operação já tiver produzido efeitos
  definitivos.
- FR-003: O sistema deve permitir que uma nova tentativa de hard delete do
  mesmo work, após uma falha parcial anterior, complete a operação com
  sucesso sem erro causado por o estado deixado pela tentativa anterior
  (por exemplo, sem falhar ao tentar remover novamente uma imagem já
  removida do storage externo em uma tentativa anterior).
- FR-004: O comportamento definido para falha parcial deve ser aplicado
  exclusivamente ao work e às imagens identificados pelo `workId`
  solicitado, sem afetar works ou imagens de outros registros.
- FR-005: O comentário JSDoc de `HardDeleteWorkUseCase` deve ser corrigido
  para descrever o comportamento real implementado em caso de falha parcial
  na remoção de imagens, removendo a afirmação atual de que a ordem de
  remoção "evita registros órfãos".
- FR-006: `docs/api-contract.md` deve documentar o comportamento do
  endpoint de hard delete de work em cenário de falha parcial na remoção de
  imagens, incluindo o(s) status HTTP possível(is) e o efeito esperado
  sobre o estado do work.

## Non-Functional Requirements

- NFR-001 (Consistência/Persistência): Qualquer estratégia de compensação
  ou retry adotada para resolver a falha parcial deve preservar a regra de
  que operações destrutivas/cascata sejam explícitas e limitadas ao
  identificador (`workId`) solicitado, conforme `.claude/rules/persistence.md`.
- NFR-002 (Observabilidade): A falha parcial deve continuar sendo
  registrada de forma que permita diagnóstico (log de erro), sem expor
  credenciais, respostas brutas do provedor externo ou dados sensíveis nos
  logs ou na resposta HTTP.
- NFR-003 (Compatibilidade): O comportamento do hard delete de work em
  cenário de sucesso total (todas as imagens removidas com sucesso) não
  deve ser alterado por esta correção.

## Acceptance Criteria

- AC-001: Quando o hard delete de um work com múltiplas imagens é
  executado e a remoção de ao menos uma imagem falha no storage externo
  após outra(s) imagem(ns) já terem sido removidas com sucesso, o sistema
  retorna uma resposta HTTP cujo status e corpo refletem corretamente o
  resultado real da operação (não reporta sucesso total quando o estado
  final é inconsistente).
- AC-002: Após o cenário descrito em AC-001, uma nova chamada de hard
  delete para o mesmo `workId` completa a operação com sucesso, sem erro
  causado por tentar remover novamente uma imagem já removida do storage
  externo em uma tentativa anterior.
- AC-003: Após a conclusão bem-sucedida do hard delete (seja em uma única
  tentativa ou após uma nova tentativa conforme AC-002), o work deixa de
  existir no MongoDB e nenhuma das suas imagens permanece referenciada de
  forma a apontar para um arquivo inexistente no storage externo.
- AC-004: O hard delete de um work de outro `workId`, não relacionado ao
  cenário de falha parcial, continua funcionando normalmente e não é
  afetado pela correção.
- AC-005: O comentário JSDoc de `HardDeleteWorkUseCase` não afirma mais que
  a ordem de remoção (imagens antes do Mongo) "evita registros órfãos"
  quando esse não for o comportamento real implementado.
- AC-006: `docs/api-contract.md` descreve o comportamento do hard delete de
  work em cenário de falha parcial na remoção de imagens, incluindo o
  status HTTP retornado nesse cenário.
- AC-007: Existe teste automatizado cobrindo o cenário de falha parcial
  (remoção de imagem N falha após imagens `1..N-1` terem sido removidas com
  sucesso), validando o comportamento definido em FR-001/FR-002/FR-003.

## Constraints

- A correção deve ser aplicada dentro dos limites arquiteturais existentes
  (`src/usecase`, portas de domínio, adapters em `src/infra`), sem que o
  use case passe a depender de detalhes de infraestrutura (Express,
  Mongoose, SDK do Cloudinary) além do que já é exposto pelas portas
  (`WorkRepositoryPort`, `ImageStoragePort`), salvo se o `architect`
  justificar explicitamente uma extensão de porta.
- Nenhum valor real de ambiente, segredo, credencial ou dado de produção
  pode ser incluído em nenhum artefato desta especificação
  (`.claude/rules/spec-security.md`).
- A URL base da API é fornecida via configuração de ambiente (`API_URL`);
  esta especificação não fixa nenhum valor concreto de ambiente.
- Requisições autenticadas usam a estratégia existente de Bearer token do
  projeto; nenhum valor de token faz parte desta especificação.
- Esta especificação não prescreve a estratégia técnica exata (retry
  idempotente, flag de imagens já removidas, outra abordagem) — essa
  decisão pertence à fase de arquitetura.

## Dependencies

- `src/usecase/hard-delete-work.use-case.ts` — use case a ser corrigido.
- `src/core/domain/application/Storage/image-storage.port.ts` —
  `ImageStoragePort`, contrato usado para remoção de imagens no storage
  externo.
- `src/core/domain/repositories/work.repository.ts` —
  `WorkRepositoryPort`, contrato usado para leitura/remoção do work no
  MongoDB.
- `src/infra/gateway/cloudinary/cloudinary-storage.service.ts` —
  implementação concreta ativa de `ImageStoragePort`.
- `docs/api-contract.md` — documento a ser atualizado.
- CARSHOP-122 — tarefa de origem que documentou o contrato de API e
  identificou esta divergência.

## Out of Scope

- Definição da estratégia técnica exata de compensação/retry (decisão do
  `architect`, não desta especificação).
- Alterações no fluxo de remoção de imagens fora do contexto de hard
  delete de work (por exemplo, remoção individual de imagem via outro
  endpoint), salvo se estritamente necessárias para resolver a
  inconsistência descrita.
- Mudanças no comportamento de sucesso total do hard delete (todas as
  imagens removidas com sucesso), além da correção do JSDoc.
- Introdução de um novo mecanismo de fila, job assíncrono ou processamento
  em background, a menos que o `architect` determine que é necessário para
  atender aos requisitos funcionais acima.

## Risks

- Toca persistência (MongoDB) e integração externa (Cloudinary)
  simultaneamente, aumentando a superfície de possíveis efeitos colaterais.
- Qualquer estratégia de compensação/retry precisa preservar as regras de
  operações destrutivas/cascata explícitas, limitadas ao identificador
  solicitado e cobertas por teste (`.claude/rules/persistence.md`).
- Risco de a resposta HTTP em cenário de falha parcial (FR-002) constituir
  uma mudança de contrato público observável pelo cliente; deve ser
  avaliada e documentada explicitamente em `docs/api-contract.md` (FR-006)
  para não ser uma quebra silenciosa de contrato.

## Open Questions

### Blocking

Nenhuma.

### Non-blocking

- O status HTTP exato a ser retornado em cenário de falha parcial (mantido
  `502`, ou um novo status/formato que sinalize sucesso parcial) não é
  prescrito por esta especificação; cabe ao `architect` decidir com base no
  padrão de erro já existente no projeto, respeitando FR-002.
- A forma concreta de persistir/sinalizar quais imagens já foram removidas
  entre tentativas (campo no modelo, flag, outro mecanismo) não é definida
  aqui; é uma decisão de arquitetura/persistência.

## Traceability

FR-001 → AC-001, AC-003
FR-002 → AC-001
FR-003 → AC-002
FR-004 → AC-004
FR-005 → AC-005
FR-006 → AC-006
NFR-001 → AC-002, AC-003, AC-004
NFR-002 → AC-001
NFR-003 → AC-004
