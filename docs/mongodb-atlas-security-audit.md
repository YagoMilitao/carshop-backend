# Auditoria de Segurança do MongoDB Atlas

## Contexto

Este documento registra o resultado de uma auditoria de postura de
segurança (CARSHOP-137) sobre o cluster MongoDB Atlas usado pela
aplicação e sobre os dados persistidos via Mongoose. O objetivo é
permitir que qualquer desenvolvedor entenda o que já é verificável no
próprio repositório, o que depende de confirmação manual no painel do
Atlas (fora deste repositório), e deixar registrada a evidência de
conformidade encontrada — seguindo o mesmo padrão já usado em
`docs/admin-credential-security.md` (CARSHOP-141).

Esta é uma auditoria de postura de segurança de infraestrutura e dados,
não a introdução de uma nova funcionalidade de aplicação. Conforme o
`specs/CARSHOP-137/spec.md`, conceitos de bancos relacionais como
Row-Level Security (RLS) e "public key" não são transplantados
artificialmente para o MongoDB — o objetivo é identificar o mecanismo
equivalente já existente nesta arquitetura, quando houver.

Grande parte da evidência necessária para os itens abaixo reside no
painel de administração do MongoDB Atlas, fora do repositório de
código. Para esses itens, este documento remete ao checklist manual do
operador em `specs/CARSHOP-137/operator-checklist.md`. Enquanto os
resultados operacionais de FR-001 e FR-002 não forem preenchidos, esta
auditoria permanece **incompleta** e não deve ser descrita como uma
confirmação da postura real do cluster. Nenhum valor sensível
(connection string real, credencial real, IP interno real) é citado
neste documento, apenas o nome da variável de ambiente `MONGO_URI`.

## Acesso de rede — Network Access (FR-001)

A configuração real de network access (IP allowlist restrita vs.
`0.0.0.0/0` aberto) do cluster Atlas usado pela aplicação **não foi
registrada**. Ela não é verificável apenas a partir do código-fonte,
pois é mantida no painel do MongoDB Atlas.

**Resultado atual: PENDENTE DE VERIFICAÇÃO DO OPERADOR.** Portanto, não é
possível afirmar se o acesso está restrito ou aberto. O operador deve
registrar uma dessas duas classificações, sem IPs, CIDRs ou hostnames
reais, na seção "Network Access" de
`specs/CARSHOP-137/operator-checklist.md`; este documento deve então ser
atualizado com a mesma conclusão antes de FR-001/AC-001 ser marcado como
conforme.

## Privilégio do database user (FR-002)

Os privilégios concedidos ao usuário de banco de dados usado pela
aplicação para conectar-se via `MONGO_URI` **não foram registrados**.
Eles não são verificáveis apenas a partir do código-fonte, pois são
mantidos no painel do MongoDB Atlas (Database Access → Database Users).
O repositório não contém nenhuma credencial, nome de usuário real ou
definição de papel (role) do usuário de banco.

**Resultado atual: PENDENTE DE VERIFICAÇÃO DO OPERADOR.** Portanto, não é
possível afirmar qual role foi concedida nem se ela segue o princípio de
menor privilégio. O operador deve registrar o nome da role e seu escopo,
sem usuário ou credencial real, na seção "Database User" de
`specs/CARSHOP-137/operator-checklist.md`; este documento deve então ser
atualizado com a mesma conclusão antes de FR-002/AC-002 ser marcado como
conforme.

## TLS em trânsito (FR-003)

TLS é obrigatório para todas as conexões estabelecidas via `MONGO_URI`,
com evidência dupla:

1. **Comportamento padrão do driver/Atlas**: connection strings no
   formato `mongodb+srv://` (o formato padrão fornecido pelo MongoDB
   Atlas) habilitam TLS por padrão no driver Node do MongoDB, sem
   necessidade de configuração adicional.
2. **Reforço de validação de startup** (`src/infra/config/env.ts`):
   - `assertMongoUriShape()` (`src/infra/config/env.ts:233-239`) já
     validava, antes desta auditoria, que `MONGO_URI` inicia com
     `mongodb://` ou `mongodb+srv://`, rodando incondicionalmente em
     todo `NODE_ENV`.
   - **Gaps identificados por esta auditoria**: uma URI `mongodb://`
     sem opção de TLS era aceita em produção; além disso, a inspeção
     textual de `tls=false`/`ssl=false` podia ser contornada com nomes
     ou valores percent-encoded.
   - **Correção aplicada** (CARSHOP-137): nova função
     `assertMongoUriEnforcesTls()` (`src/infra/config/env.ts`, chamada
     logo após `assertMongoUriShape(mongoUri)` na inicialização do
     módulo) analisa a query string com `URLSearchParams`, após a
     decodificação percent-encoded, e rejeita qualquer opção `tls` ou
     `ssl` com valor `false` (case-insensitive) em todos os ambientes.
     Em produção, uma URI `mongodb://` também precisa declarar
     `tls=true` ou `ssl=true`; a exceção para URIs locais sem a opção é
     mantida apenas em desenvolvimento/teste. O `Error` cita somente o
     nome da variável (`MONGO_URI`), nunca o valor configurado.
   - Cobertura de teste: `test/unit/infra/config/env.spec.ts`, describe
     `env — MONGO_URI TLS enforcement (CARSHOP-137, FR-003, AC-003)`.

Conclusão: a aplicação exige TLS em produção: `mongodb+srv://` usa o
padrão seguro do driver, enquanto `mongodb://` exige habilitação
explícita. Tentativas de desabilitá-lo, inclusive percent-encoded, são
rejeitadas no startup em todos os ambientes.

## Criptografia em repouso — Encryption at Rest (FR-004)

O MongoDB Atlas oferece criptografia em repouso (encryption at rest)
nativamente para todos os tiers de cluster, incluindo o tier gratuito
(M0), sem necessidade de configuração adicional por parte da
aplicação. Esse é um recurso de infraestrutura do provedor, não
configurável nem verificável a partir do código-fonte deste
repositório.

Nenhuma configuração adicional é necessária por parte da aplicação para
obter esse benefício. A confirmação de qual tier de cluster está
efetivamente em uso em produção cabe ao operador humano, via
`specs/CARSHOP-137/operator-checklist.md` (seção "Encryption at Rest"),
de forma apenas informativa — não há ação corretiva de código associada
a este item.

## Exposição de dados persistidos — Inventário de Models (FR-005)

Inventário dos 9 arquivos de model Mongoose em `src/data/models/`:

| Model                                        | Coleção            | Dados sensíveis/PII                                                                                                                                                                           | Classificação                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| -------------------------------------------- | ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `work.model.ts` (`WorkModel`)                | works              | Nenhum (dados de portfólio público: título, descrição, categoria, tags, imagens)                                                                                                              | Sem exposição desnecessária                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `work-image.model.ts` (`WorkImageModel`)     | work_images        | Nenhum (`id`, `workId`, URL e texto alternativo da imagem)                                                                                                                                    | Model standalone declarado em coleção própria (`work-image.model.ts:44`), distinto do schema de imagem embutido localmente em `WorkModel`. Está unwired: fora de testes, é referenciado apenas pelo script aditivo `create-indexes.ts`, sem caminho ativo de escrita                                                                                                                                                                                                                                                                                                                                                                                 |
| `category.model.ts`                          | categories         | Nenhum                                                                                                                                                                                        | Sem exposição desnecessária                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `tag.model.ts`                               | tags               | Nenhum                                                                                                                                                                                        | Sem exposição desnecessária                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `comment.model.ts` (`CommentModel`)          | comments           | `authorName` (`comment.model.ts:21`) e `content` (`comment.model.ts:27`) são dados pessoais de visitante                                                                                      | Justificado — necessário para a funcionalidade de comentários públicos moderados; já passa por aprovação administrativa antes de ser exibido                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `auth-session.model.ts` (`AuthSessionModel`) | auth_sessions      | `email` (`auth-session.model.ts:19`) é PII persistida em cada login; `refreshTokenHash` é armazenado como hash (via `hashToken` em `auth.service.ts`); `csrfToken` é armazenado em texto puro | **Achado ativo — retenção a mitigar**: `expiresAt` é um número com índice comum, não um índice TTL, e a revogação apenas preenche `revokedAt` (`mongo-session-store.repository.ts:80-85`). Não há expurgo de produção para sessões expiradas/revogadas, então email e artefatos de sessão podem permanecer indefinidamente. `refreshTokenHash` não é reversível e o `csrfToken` isolado não concede acesso sem o refresh cookie `HttpOnly`, mas isso não elimina o risco de minimização/retenção                                                                                                                                                     |
| `admin-user.model.ts` (`AdminUserModel`)     | admin_users        | Campo `passwordHash`                                                                                                                                                                          | Scaffolding não conectado (unwired) — confirmado por `docs/admin-credential-security.md` que nenhum `.create()`/`.save()` grava este model fora do script `create-indexes.ts` (que não escreve documentos). Sem exposição ativa hoje                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `health-check-ping.model.ts`                 | health_check_pings | Nenhum                                                                                                                                                                                        | Sem exposição desnecessária — usado apenas pelo script `verify:read-write`, nunca exposto por rota                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `portfolio-work.ts` (`PortfolioWorkModel`)   | portfolio_works    | `metadata.clientName` (`portfolio-work.ts:40`) é um campo de PII (nome de cliente) que **não existe** no `WorkModel` ativo                                                                    | **Achado desta auditoria — risco residual**: este model é scaffolding não conectado (unwired), referenciado apenas por `src/main/test-portfolio-model.ts`, executável manualmente via `npm run test:portfolio:model` (script registrado em `package.json:27`), mas não invocado por nenhum fluxo de build/start/deploy/CI automatizado. Não há caminho de código ativo que grave ou exponha `clientName` hoje. Registrado como risco residual a mitigar em tarefa futura (ex.: remoção do model não utilizado ou remoção do campo `clientName`), **não remediado nesta tarefa** — está fora de escopo alterar `src/data/models/*.ts` nesta auditoria |

Conclusão: há dois achados de minimização de dados. O achado ativo é a
retenção sem prazo de `email` e artefatos em `auth_sessions`; recomenda-se
um índice TTL compatível ou uma rotina de expurgo para sessões
expiradas/revogadas. O segundo é o campo `clientName` no scaffolding
desconectado `PortfolioWorkModel`, registrado como risco residual sem
exposição ativa hoje.

## Row-Level Security (RLS) — não aplicável (FR-006)

RLS é um conceito de bancos de dados relacionais (aplicação de
políticas de acesso por linha, no nível do próprio motor de banco de
dados) sem equivalente nativo direto no MongoDB. Este projeto não
implementa RLS, e não deve implementá-lo artificialmente — conforme
`specs/CARSHOP-137/spec.md` (seção "Constraints").

O papel funcional equivalente nesta arquitetura é cumprido por dois
mecanismos combinados:

1. **Autorização na camada de aplicação**: `buildAuthMiddleware`
   (`src/infra/presentation/middleware/auth.middleware.ts:36`) protege
   as rotas administrativas (`/admin/*`), validando tipo, assinatura,
   expiração do token JWT e o status da sessão no `SessionStorePort`
   antes de liberar qualquer acesso de escrita/moderação. Não há
   acesso de leitura/escrita "por linha" no MongoDB sem passar por essa
   camada para as operações administrativas.
2. **Least-privilege do database user do Atlas**: o papel concedido ao
   usuário de banco de dados da aplicação (ver FR-002 acima) limita, no
   nível do próprio Atlas, quais databases/coleções são acessíveis pela
   aplicação como um todo — o controle equivalente de "privilégio
   mínimo" do lado do provedor, confirmado via
   `specs/CARSHOP-137/operator-checklist.md`.

Conclusão: RLS não é aplicável a esta arquitetura MongoDB. A
combinação de autorização de aplicação (`authMiddleware`) e
least-privilege do database user do Atlas cumpre o papel funcional
equivalente.

## "Public key" — não aplicável (FR-007)

O conceito de "public key" de bancos SQL (chave pública de acesso,
frequentemente associada a mecanismos de autenticação por certificado
ou par de chaves em alguns bancos relacionais/gerenciados) **não possui
equivalente necessário** nesta arquitetura MongoDB/Mongoose.

A aplicação se autentica no MongoDB Atlas exclusivamente através da
credencial embutida na connection string `MONGO_URI` (usuário/senha do
database user do Atlas, nunca citados por valor neste repositório).
Não existe, no código-fonte ou na infraestrutura declarada neste
repositório, nenhum mecanismo de "chave pública" separado para acesso
ao banco de dados. Este item é declarado explicitamente como não
aplicável.

## Criptografia em nível de campo — Field-Level Encryption (FR-008)

Field-level encryption (criptografia de campos específicos no nível da
aplicação, antes da persistência) **não é necessária no momento**.

Justificativa, com base no inventário de FR-005:

- Nenhum dado de alto risco (ex.: número de cartão de crédito, CPF,
  senha em texto puro reutilizável) é persistido hoje por nenhum model
  ativo.
- `refreshTokenHash` (`auth-session.model.ts:30`) já é armazenado como
  hash, não em texto puro — não exige uma segunda camada de
  criptografia de campo.
- O `email` de `auth_sessions` é PII, mas não é, isoladamente, dado de
  alto risco que justifique a complexidade de field-level encryption. O
  controle proporcional é limitar sua retenção por TTL ou expurgo, gap
  registrado em FR-005.
- O único achado de PII (`PortfolioWorkModel.metadata.clientName`) está
  em um model de scaffolding não conectado, sem caminho de escrita
  ativo (ver FR-005) — introduzir field-level encryption para um campo
  não gravado seria uma implementação especulativa, explicitamente
  desencorajada por `specs/CARSHOP-137/spec.md` (seção "Constraints").

Caso uma tarefa futura conecte `PortfolioWorkModel` a um fluxo de
escrita ativo, essa tarefa deve reavaliar a necessidade de field-level
encryption (ou de simplesmente remover o campo `clientName`) como parte
do seu próprio escopo — decisão de arquitetura não antecipada aqui.

Conclusão: field-level encryption não é necessária hoje. Os riscos de
`auth_sessions.email` e do campo inerte `clientName` exigem minimização
e retenção adequadas, não criptografia de campo como primeira medida.

## Resumo de conformidade (FR-009 / AC-009)

| Item do DoD                                         | Requisito        | Estado                                        | Observação                                                                                                                                                |
| --------------------------------------------------- | ---------------- | --------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Network access (restrito vs. aberto)                | FR-001 / AC-001  | Pendente — auditoria incompleta               | O operador ainda precisa registrar no artefato versionado se o acesso real está restrito ou aberto                                                        |
| Privilégio do database user                         | FR-002 / AC-002  | Pendente — auditoria incompleta               | O operador ainda precisa registrar o nome/escopo da role e se segue menor privilégio                                                                      |
| TLS obrigatório                                     | FR-003 / AC-003  | Atendido                                      | `mongodb+srv://` implica TLS por padrão; em produção, `mongodb://` exige `tls=true`/`ssl=true`; opções `false`, inclusive percent-encoded, são rejeitadas |
| Encryption at rest                                  | FR-004 / AC-004  | Atendido (oferta nativa do provedor)          | Não configurável via código; tier real confirmado via checklist                                                                                           |
| Exposição desnecessária de dados                    | FR-005 / AC-005  | Parcial — riscos documentados                 | `auth_sessions` retém email e artefatos sem TTL/expurgo; `PortfolioWorkModel.metadata.clientName` é PII em scaffolding unwired                            |
| RLS não aplicável                                   | FR-006 / AC-006  | Não aplicável (constatação formal)            | Equivalente funcional: `authMiddleware` + least-privilege do database user do Atlas                                                                       |
| "Public key" não aplicável                          | FR-007 / AC-007  | Não aplicável (constatação formal)            | Único segredo de acesso ao banco é `MONGO_URI`                                                                                                            |
| Field-level encryption                              | FR-008 / AC-008  | Não necessária no momento (decisão explícita) | Nenhum dado de alto risco identificado; reavaliar se `PortfolioWorkModel` for conectado a um fluxo de escrita ativo                                       |
| Ausência de credencial/segredo real neste documento | NFR-001 / AC-010 | Atendido                                      | Apenas nomes de variáveis (`MONGO_URI`) e placeholders; nenhum IP, hostname ou credencial real                                                            |

Nenhuma alteração foi feita em `src/data/models/*.ts` como resultado
desta auditoria — a recomendação sobre `PortfolioWorkModel.clientName`
e a recomendação de retenção para `auth_sessions` são achados
documentados, não implementações, alinhados ao "Out of Scope" de
`specs/CARSHOP-137/spec.md`. A única alteração de código de produção
desta tarefa foi o reforço da validação de TLS em
`src/infra/config/env.ts`, descrito na seção "TLS em trânsito" acima.
