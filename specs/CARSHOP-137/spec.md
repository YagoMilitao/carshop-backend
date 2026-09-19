# CARSHOP-137 — Auditar exposição, privilégios e criptografia de dados no MongoDB Atlas

## Status

Ready

## Source

Notion Task:
CARSHOP-137

## Context

O projeto persiste dados via MongoDB Atlas/Mongoose (`MONGO_URI`). Até o
momento, o repositório documenta a postura de segurança da credencial
administrativa de aplicação (`docs/admin-credential-security.md`,
CARSHOP-141), mas não existe, ainda, uma auditoria e um registro
equivalente para a postura de segurança do próprio cluster MongoDB Atlas
e dos dados nele persistidos: acesso de rede, privilégios do usuário de
banco de dados usado pela aplicação, obrigatoriedade de TLS em trânsito,
criptografia em repouso oferecida pelo provedor, e exposição
desnecessária de dados persistidos.

Esta tarefa é uma auditoria de postura de segurança de infraestrutura e
dados — não a introdução de uma nova funcionalidade de aplicação. A
descrição da tarefa alerta explicitamente contra transplantar conceitos
de bancos relacionais (Row-Level Security — RLS, "public keys") para o
MongoDB: o equivalente funcional já existe nesta arquitetura por meio de
controles nativos do Atlas (network access, database users/roles, TLS,
encryption at rest) e de autorização na camada de aplicação (middleware
de autenticação/autorização já existente). Esta tarefa complementa,
sem bloquear-se por elas, as tarefas CARSHOP-36 e CARSHOP-42.

Grande parte da evidência necessária para o Definition of Done reside no
painel de administração do MongoDB Atlas, fora do repositório de código.
O objetivo desta especificação é definir requisitos testáveis para que
essa evidência seja auditada e documentada no repositório, seguindo o
padrão já estabelecido por `docs/admin-credential-security.md`, sem que
nenhum valor sensível (connection string real, credencial real, IP
interno real) seja copiado para um artefato versionado.

## Objective

Produzir uma auditoria documentada e verificável da postura de segurança
do MongoDB Atlas e dos dados persistidos pela aplicação, cobrindo acesso
de rede, privilégio do usuário de aplicação, TLS em trânsito,
criptografia em repouso e exposição desnecessária de dados — registrando
o resultado em um documento versionado no padrão já usado pelo projeto,
com riscos residuais e a decisão sobre criptografia em nível de campo
explicitamente documentados, e com a inaplicabilidade de RLS a esta
arquitetura Mongo formalmente registrada como constatação (não como
lacuna pendente).

## Functional Requirements

FR-001 — O documento de auditoria deve registrar a configuração atual de
acesso de rede (network access) do cluster Atlas usado pela aplicação,
declarando explicitamente se o acesso está restrito a uma lista de
origens conhecidas (IP allowlist) ou se está aberto amplamente (ex.:
`0.0.0.0/0`), sem citar nenhum IP, hostname ou identificador de cluster
real.

FR-002 — O documento de auditoria deve registrar os privilégios
concedidos ao usuário de banco de dados (`database user`) usado pela
aplicação para conectar-se via `MONGO_URI`, declarando explicitamente se
esses privilégios seguem o princípio de menor privilégio (acesso restrito
ao(s) database(s)/coleção(ões) necessário(s) à aplicação) ou se excedem
esse escopo (ex.: papéis administrativos amplos), sem citar nenhuma
credencial, nome de usuário real ou senha.

FR-003 — O documento de auditoria deve confirmar e registrar se TLS é
obrigatório para todas as conexões estabelecidas via `MONGO_URI`,
incluindo a evidência usada para essa confirmação (ex.: comportamento
padrão do driver/Atlas para `mongodb+srv://`, ou uma verificação
explícita realizada).

FR-004 — O documento de auditoria deve confirmar e registrar o que o
provedor (MongoDB Atlas) já oferece nativamente em termos de criptografia
em repouso (encryption at rest) para o cluster usado pela aplicação, e se
alguma configuração adicional é necessária ou está pendente.

FR-005 — O documento de auditoria deve revisar e registrar quais dados
persistidos pela aplicação (nos modelos Mongoose existentes) representam
exposição potencialmente desnecessária — dados sensíveis, dados pessoais
ou dados além do necessário para a funcionalidade do produto — e para
cada caso identificado, declarar se há justificativa de negócio para a
persistência ou se é uma exposição a mitigar.

FR-006 — O documento de auditoria deve registrar explicitamente que Row-
Level Security (RLS), como conceito de bancos relacionais, não é
aplicável à arquitetura atual do MongoDB deste projeto, e descrever qual
mecanismo desta arquitetura cumpre um papel equivalente (autorização na
camada de aplicação via middleware de autenticação/autorização
existente, e/ou papéis de banco do Atlas).

FR-007 — O documento de auditoria deve registrar explicitamente se o
conceito de "public key" de bancos SQL possui algum equivalente
necessário nesta arquitetura Mongo, ou se é declarado não aplicável, com
a justificativa correspondente.

FR-008 — O documento de auditoria deve declarar explicitamente se
criptografia em nível de campo (field-level encryption) é necessária
para algum dado atualmente persistido pela aplicação, com a justificativa
de risco correspondente; na ausência de dados de alto risco que a
justifiquem, o documento deve declarar explicitamente que ela não é
necessária no momento, evitando implementação especulativa.

FR-009 — O documento de auditoria deve listar, para cada item do
Definition of Done desta tarefa, o estado encontrado (conforme / não
conforme / não aplicável) e, quando aplicável, uma recomendação de
correção, seguindo o padrão de tabela de resumo de conformidade já usado
em `docs/admin-credential-security.md`.

## Non-Functional Requirements

NFR-001 (Segurança) — Nenhum valor real de credencial de banco de dados,
connection string completa, IP interno, hostname privado, ou qualquer
outro segredo deve ser incluído no documento de auditoria ou em qualquer
artefato versionado produzido por esta tarefa. Apenas nomes de variáveis
de ambiente (ex.: `MONGO_URI`) e placeholders fictícios são permitidos,
seguindo `.claude/rules/spec-security.md`.

NFR-002 (Rastreabilidade) — O documento de auditoria deve referenciar
arquivos e trechos de código-fonte relevantes (por caminho de arquivo, e
número de linha quando aplicável) como evidência para cada constatação,
no mesmo padrão de citação já usado em `docs/admin-credential-security.md`.

NFR-003 (Manutenibilidade) — O documento de auditoria deve ser
armazenado em local consistente com a convenção já usada pelo projeto
para documentação de segurança (`docs/`), de forma que futuras tarefas
relacionadas (ex.: CARSHOP-36, CARSHOP-42) possam referenciá-lo sem
duplicar conteúdo.

## Acceptance Criteria

AC-001 — O documento de auditoria declara explicitamente se o acesso de
rede do Atlas está restrito ou aberto, sem citar nenhum IP ou hostname
real. (FR-001)

AC-002 — O documento de auditoria declara explicitamente se o usuário de
banco de dados da aplicação segue o princípio de menor privilégio,
listando os privilégios concedidos por nome de papel (role), sem citar
nenhuma credencial real. (FR-002)

AC-003 — O documento de auditoria confirma, com evidência citada, que
TLS é obrigatório em todas as conexões da aplicação ao MongoDB Atlas.
(FR-003)

AC-004 — O documento de auditoria confirma e descreve o mecanismo de
criptografia em repouso já oferecido pelo Atlas para o cluster usado
pela aplicação. (FR-004)

AC-005 — O documento de auditoria lista pelo menos os campos/coleções
persistidos hoje pela aplicação (conforme `src/data/models/*.model.ts`)
e classifica cada um quanto a exposição desnecessária, com justificativa
quando a persistência for considerada necessária. (FR-005)

AC-006 — O documento de auditoria contém uma declaração explícita de que
RLS não é aplicável a esta arquitetura MongoDB, junto com o mecanismo
equivalente identificado nesta base de código. (FR-006)

AC-007 — O documento de auditoria contém uma declaração explícita sobre
a aplicabilidade (ou não) do conceito de "public key" de bancos SQL a
esta arquitetura. (FR-007)

AC-008 — O documento de auditoria contém uma decisão explícita e
justificada sobre a necessidade (ou não) de criptografia em nível de
campo, sem implementá-la de forma especulativa quando não justificada.
(FR-008)

AC-009 — O documento de auditoria contém uma tabela de resumo de
conformidade, no mesmo padrão de `docs/admin-credential-security.md`,
cobrindo todos os itens do Definition of Done desta tarefa (network
access, database user, TLS, encryption at rest, ausência de credenciais
públicas, riscos residuais, necessidade de field-level encryption,
inaplicabilidade de RLS). (FR-009)

AC-010 — Nenhum arquivo produzido por esta tarefa sob `specs/` ou `docs/`
contém uma connection string real, uma credencial real, um IP interno
real ou qualquer outro valor sensível — apenas nomes de variáveis de
ambiente e placeholders fictícios. (NFR-001)

## Constraints

- Esta é uma auditoria de postura de segurança e documentação; não é uma
  nova feature de aplicação. Qualquer alteração em código de produção
  decorrente desta auditoria (ex.: scripts de verificação) é uma decisão
  de implementação (HOW) que cabe ao Architect, não a esta especificação.
- RLS e "public keys" de bancos SQL não devem ser implementados
  artificialmente nesta arquitetura MongoDB. A avaliação deve usar
  controles nativos do Atlas e autorização na camada de aplicação já
  existente.
- Field-level encryption não é mandatória por padrão; só deve ser
  considerada se dados de alto risco identificados na auditoria
  justificarem a complexidade adicional.
- Nenhum segredo, credencial, connection string real, IP interno real ou
  valor de `.env` pode ser incluído em `specs/` ou em qualquer
  documentação versionada (`.claude/rules/spec-security.md`).
- A migração para um banco relacional apenas para obter RLS está fora de
  escopo e não deve ser considerada.

## Dependencies

- Acesso ao painel do MongoDB Atlas do cluster usado pela aplicação, para
  observar (sem alterar destrutivamente) configurações de network access,
  database users/roles, TLS e encryption at rest.
- `docs/admin-credential-security.md` como referência de padrão de
  documento de auditoria já aceito no projeto.
- `src/data/models/*.model.ts` como fonte de verdade dos dados
  atualmente persistidos pela aplicação.
- Variável de ambiente `MONGO_URI` (apenas o nome, nunca o valor) como
  referência de configuração de conexão.
- Complementa, sem bloquear-se por elas, as tarefas CARSHOP-36 e
  CARSHOP-42 (requisitos dessas tarefas não foram recuperados nesta
  auditoria).

## Out of Scope

- Implementação de Row-Level Security (RLS) ou de um equivalente
  artificial de "public keys" de bancos SQL nesta arquitetura MongoDB.
- Migração de MongoDB para um banco de dados relacional.
- Implementação de criptografia em nível de campo (field-level
  encryption), a menos que a própria auditoria identifique dados de alto
  risco que a justifiquem — e, mesmo nesse caso, a implementação em si é
  uma decisão de arquitetura a ser avaliada separadamente, fora desta
  auditoria.
- Alteração de credenciais reais, rotação de senhas do Atlas, ou qualquer
  operação destrutiva/mutativa sobre o cluster de produção.
- Requisitos específicos das tarefas CARSHOP-36 e CARSHOP-42, que não
  foram recuperados e não fazem parte do escopo retornado pelo
  task-reader para esta tarefa.

## Risks

- Grande parte da evidência necessária (network access, database user
  roles, TLS, encryption at rest) reside no painel do Atlas, fora do
  repositório — existe risco de a documentação ficar desatualizada em
  relação à configuração real do Atlas se não houver um processo de
  revisão periódica.
- Ambiguidade quanto à necessidade de código de verificação automatizada
  (ex.: um script que valide que `MONGO_URI` força TLS, no padrão de
  `verify:indexes`/`verify:read-write` já existentes) versus uma auditoria
  puramente documental. Esta especificação não decide essa ambiguidade;
  ela é uma decisão de HOW que cabe ao Architect.
- Risco de exposição acidental de segredos ao documentar a auditoria, caso
  qualquer evidência coletada do Atlas (screenshots, exports) contenha
  valores reais — mitigado pela regra explícita de nunca copiar
  credenciais, connection strings ou valores de `.env` reais para
  artefatos versionados.

## Open Questions

### Blocking

Nenhuma.

### Non-blocking

- Esta auditoria deve produzir apenas documentação (`docs/`), ou também
  código de verificação automatizada (ex.: script `verify:tls` análogo a
  `verify:indexes`/`verify:read-write`)? Decisão de HOW, delegada ao
  Architect na Fase 5.
- Os requisitos completos de CARSHOP-36 e CARSHOP-42 (não recuperados)
  podem revelar sobreposição ou dependência adicional com esta task; não
  bloqueante para o início desta auditoria.

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
NFR-001 → AC-010
