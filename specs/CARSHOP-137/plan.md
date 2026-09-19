# CARSHOP-137 — Implementation Plan

## Source

Specification:
`specs/CARSHOP-137/spec.md`

## Architect Verdict

READY FOR IMPLEMENTATION

## Objective

Produzir uma auditoria documentada (não uma feature) da postura de
segurança do MongoDB Atlas e dos dados persistidos pela aplicação,
cobrindo: network access, privilégio do database user, TLS em trânsito,
encryption at rest, exposição desnecessária de dados nos models
Mongoose, inaplicabilidade de RLS/"public key" a este contexto Mongo,
necessidade (ou não) de field-level encryption, e uma tabela de
conformidade — sem nenhum segredo real (`.claude/rules/spec-security.md`).
O mapeamento FR-001..FR-009/NFR-001..003 → AC-001..AC-010 do
`spec.md` será usado 1:1 como estrutura do documento de auditoria.

Confirmado: nenhuma alteração de contrato HTTP é implicada. Swagger não
é aplicável.

## Current Architecture

Achados da inspeção do repositório:

- `src/infra/config/env.ts:233-239` (`assertMongoUriShape`): valida
  apenas que `MONGO_URI` começa com `mongodb://` ou `mongodb+srv://`;
  NÃO rejeita `tls=false`/`ssl=false` explícito na query string. Gap
  repository-verifiable real.
- `src/data/models/admin-user.model.ts` (`AdminUserModel`, campo
  `passwordHash`): confirmado unwired (nenhum `.create()`/`.save()`
  fora de `create-indexes.ts`), coerente com
  `docs/admin-credential-security.md` (CARSHOP-141).
- Achado NOVO: `src/data/models/portfolio-work.ts`
  (`PortfolioWorkModel`, collection `portfolio_works`) também é
  scaffolding unwired, referenciado só por
  `src/main/test-portfolio-model.ts` (script manual fora de
  `package.json`). Seu `metadata.clientName` é um campo de PII que não
  existe no `WorkModel` ativo (`src/data/models/work.model.ts`). Deve
  ser documentado como risco residual (achado, não implementação — a
  remoção fica para tarefa futura).
- `AuthSessionModel`: `refreshTokenHash` é hash (conforme, via
  `auth.service.ts` `hashToken`); `csrfToken` é armazenado em texto
  puro — aceitável pois é o valor comparado no double-submit CSRF, sem
  valor sozinho sem o cookie `refresh_token` HttpOnly correspondente.
- `CommentModel.authorName`/`content`: dado pessoal de visitante,
  necessário à funcionalidade — justificado.
- `WorkModel`/`work-image.model.ts`/`category.model.ts`/`tag.model.ts`/
  `health-check-ping.model.ts`: dados de portfólio público, sem PII.

## Proposed Solution

Produzir dois artefatos de documentação e um único ajuste de código
repository-verifiable, conforme detalhado em "Technical Decisions" e
"Files" abaixo. Nenhuma mudança de contrato HTTP, models Mongoose ou
Swagger.

## Technical Decisions

### Decision

Criar `docs/mongodb-atlas-security-audit.md` seguindo o formato de
`docs/admin-credential-security.md` (seções por FR, citações de
arquivo/linha como evidência, tabela de conformidade final).

### Reason

Padrão já estabelecido e aceito no projeto para documentos de auditoria
de segurança (NFR-002, NFR-003); reaproveita a estrutura validada por
CARSHOP-141.

### Alternatives Considered

Nenhuma alternativa de formato foi considerada necessária — o padrão
existente já atende aos requisitos de rastreabilidade e manutenibilidade.

### Trade-offs

Nenhum trade-off relevante identificado para esta decisão.

---

### Decision

Conteúdo do documento de auditoria por requisito:

- **FR-001 (network access):** estado real da allowlist do Atlas NÃO
  verificável pelo repositório — remeter ao
  `specs/CARSHOP-137/operator-checklist.md`. Citar a nota histórica de
  troubleshooting só como contexto não verificável.
- **FR-002 (privilégio do database user):** mesmo tratamento — não
  verificável no repositório, remeter ao checklist.
- **FR-003 (TLS):** documentar que `mongodb+srv://` implica TLS por
  padrão no driver Node; citar `assertMongoUriShape()` como evidência
  de validação estrutural existente; registrar o gap encontrado (não
  rejeitava `tls=false`/`ssl=false`) e referenciar o reforço de código
  feito (ver decisão de código abaixo).
- **FR-004 (encryption at rest):** oferta nativa do Atlas (todos os
  tiers, incluindo M0, cifram em repouso por padrão) — não
  configurável/verificável via código; remeter ao checklist apenas para
  confirmar o tier real em uso.
- **FR-005 (exposição de dados):** inventário completo dos 9 models com
  a classificação descrita em "Current Architecture", incluindo o
  achado novo do `PortfolioWorkModel.clientName`.
- **FR-006 (RLS não aplicável):** declarar formalmente que RLS é
  conceito de bancos relacionais sem equivalente nativo no MongoDB;
  equivalente nesta arquitetura = (a) `authMiddleware`
  (`src/infra/presentation/middleware/auth.middleware.ts`) protegendo
  `/admin/*`, e (b) least-privilege do database user do Atlas (item do
  checklist).
- **FR-007 ("public key"):** não aplicável — não existe conceito de
  chave pública de acesso em MongoDB/Mongoose; único segredo de acesso
  é `MONGO_URI`.
- **FR-008 (field-level encryption):** não necessária no momento —
  nenhum dado de alto risco identificado no inventário;
  `refreshTokenHash` já é hash. Registrar risco residual do
  `clientName` inerte, mas concluir que field-level encryption seria
  desproporcional hoje.
- **FR-009 (tabela de conformidade):** Requisito | Estado
  (Atendido/Não conforme/Não aplicável/Não verificável pelo
  repositório) | Observação.

### Reason

Mapeia 1:1 os FRs/ACs do spec para o conteúdo do documento, garantindo
rastreabilidade completa (NFR-002) e cobertura de todos os itens do
Definition of Done (AC-009).

### Alternatives Considered

Nenhuma alternativa de escopo de conteúdo foi considerada — o conteúdo
decorre diretamente dos requisitos do spec.

### Trade-offs

Itens de FR-001, FR-002 e FR-004 não são verificáveis pelo repositório
e dependem do checklist manual do operador para confirmação real
contra o Atlas; risco de desatualização já registrado em "Risks".

---

### Decision

Criar `specs/CARSHOP-137/operator-checklist.md` (checklist manual em
pt-BR), seguindo exatamente o formato/avisos de
`specs/CARSHOP-43/operator-checklist.md` (aviso de que nenhum agente
tem acesso ao Atlas UI, não substitui o spec; nunca conter segredo
real). Itens:

- Network Access: allowlist restrita a IPs/CIDRs conhecidos vs.
  `0.0.0.0/0` (recomendar restrição se aberta).
- Database User: papel restrito ao(s) database(s) da aplicação (ex.:
  `readWrite` escopado), não `atlasAdmin`/`dbAdminAnyDatabase`.
- TLS: confirmar no painel do Atlas que não há flag desabilitando TLS
  na config do cluster.
- Encryption at rest: confirmar tier do cluster e que a criptografia
  padrão do provedor está ativa (informativo).
- Registro de execução: operador registra resultado fora do
  repositório (Notion), nunca com valores reais neste arquivo.

### Reason

Segue o padrão já validado em CARSHOP-43 para tarefas de auditoria que
dependem de evidência externa ao repositório (painel do Atlas).

### Alternatives Considered

Nenhuma — reaproveita padrão existente e aceito no projeto.

### Trade-offs

O checklist não é verificável automaticamente; depende de execução
manual e honesta pelo operador, fora do escopo desta tarefa.

---

### Decision

Único ajuste de código: em `src/infra/config/env.ts`, estender
`assertMongoUriShape` ou adicionar nova função
`assertMongoUriEnforcesTls` (seguindo o padrão de funções `assert*` já
existentes), chamada logo após, para rejeitar explicitamente
`MONGO_URI` cuja query string contenha `tls=false` ou `ssl=false`
(case-insensitive), lançando `Error` citando apenas o nome da variável
(`MONGO_URI`), nunca o valor. Deve rodar incondicionalmente em todo
`NODE_ENV`, mesmo padrão de `assertMongoUriShape`. NÃO criar um script
`verify:tls` standalone — reforçar a validação de startup já existente
é suficiente.

Nenhuma alteração em `src/data/models/*.ts` nesta tarefa (recomendação
sobre `clientName` é registrada como achado/risco futuro, não
implementada — alinhado ao "Out of Scope" do spec).

### Reason

Endereça o gap real encontrado na inspeção do repositório (FR-003) de
forma mínima e consistente com o padrão de validação de startup já
existente, sem introduzir um script novo desnecessário (resolve a
ambiguidade não-bloqueante do spec sobre "documentação vs. código de
verificação").

### Alternatives Considered

Criar um script standalone `verify:tls` análogo a `verify:indexes`/
`verify:read-write` — descartada porque reforçar a validação de
startup já existente é suficiente e mais simples.

### Trade-offs

A nova validação deve checar apenas presença explícita de
`tls=false`/`ssl=false` — não exige `tls=true`, preservando
compatibilidade com `mongodb://localhost:27017/test` (dev/test) e
`mongodb+srv://...` sem parâmetros.

## Execution Flow

1. Inspecionar `src/data/models/*.model.ts` para confirmar/atualizar o
   inventário de exposição de dados (FR-005).
2. Implementar a validação de TLS em `src/infra/config/env.ts`
   (`assertMongoUriEnforcesTls` ou extensão de
   `assertMongoUriShape`), chamada incondicionalmente em todo
   `NODE_ENV`.
3. Adicionar/atualizar os testes unitários correspondentes (ver
   "Testing Strategy").
4. Criar `docs/mongodb-atlas-security-audit.md` cobrindo FR-001 a
   FR-009 conforme detalhado em "Technical Decisions".
5. Criar `specs/CARSHOP-137/operator-checklist.md`.
6. Atualizar `.env.example` (comentário sobre `MONGO_URI`).
7. Opcionalmente referenciar o novo documento de auditoria em
   `README.md`.
8. Rodar `npm test` e `npm run build`; `npm run test:e2e` opcional por
   precaução.

## Files

### Files to Create

- `docs/mongodb-atlas-security-audit.md`
- `specs/CARSHOP-137/operator-checklist.md`

### Files to Modify

- `src/infra/config/env.ts` (nova validação de TLS, incondicional em
  todo `NODE_ENV`, seguindo o padrão de `assertMongoUriShape`)
- `test/unit/infra/config/env.spec.ts` (localizar o spec exato durante
  a implementação; padrão esperado é este caminho)
- `.env.example` (atualizar comentário existente sobre `MONGO_URI`,
  linhas ~12-15, mencionando que `tls=false`/`ssl=false` são
  rejeitados no startup — sem valor real)
- `README.md` (opcional: referenciar
  `docs/mongodb-atlas-security-audit.md` na seção "Banco de Dados
  (MongoDB Atlas)", análogo à referência já feita a
  `docs/admin-credential-security.md` na seção "Segurança" —
  recomendado, não obrigatório pelos ACs)

Nenhuma alteração em `src/data/models/*.ts` nesta tarefa.

## Contract Impact

Nenhuma mudança de rota, controller, middleware, payload, status,
cookie, header ou schema Mongoose. Swagger não precisa de atualização.

## Persistence Impact

Nenhuma. Nenhum model Mongoose é alterado nesta tarefa. A recomendação
sobre `PortfolioWorkModel.metadata.clientName` é registrada apenas como
achado/risco residual, não implementada.

## Security Impact

- Fecha um gap repository-verifiable real: `MONGO_URI` com
  `tls=false`/`ssl=false` explícito passa a ser rejeitado no startup,
  incondicionalmente em todo `NODE_ENV`.
- Mensagens de erro citam apenas o nome da variável (`MONGO_URI`),
  nunca o valor.
- Nenhum segredo, credencial, connection string real, IP interno real
  ou valor de `.env` incluído em `docs/` ou `specs/` (NFR-001, AC-010).
- Nenhum risco de regressão em autenticação/CSRF/cookies.

## Swagger Impact

Não aplicável. Nenhuma mudança de contrato HTTP é implicada por esta
tarefa.

## Testing Strategy

Único código de produção novo/alterado: a função de validação em
`env.ts`. Já existe teste unitário para `assertMongoUriShape`/demais
`assert*` (mockando `process.env`, sem I/O) — localizar o spec exato
durante implementação (padrão: `test/unit/infra/config/env.spec.ts`).
Adicionar casos:

- `tls=false` → lança erro;
- `ssl=false` → lança erro;
- URI válida sem esses parâmetros → não lança;
- variante `mongodb+srv://` válida → não lança.

Meta `>= 80%` de cobertura do código novo é plenamente alcançável, sem
exceção necessária. Documentação (`docs/*.md`, `specs/*.md`) não entra
na métrica de cobertura. Rodar `npm test` e `npm run build`;
`npm run test:e2e` opcional por precaução.

## Risks

- Grande parte da evidência necessária (network access, database user
  roles, TLS, encryption at rest) reside no painel do Atlas, fora do
  repositório — existe risco de a documentação ficar desatualizada em
  relação à configuração real do Atlas se não houver um processo de
  revisão periódica.
- Nova validação TLS deve checar apenas presença explícita de
  `tls=false`/`ssl=false` — não exige `tls=true`, preservando
  compatibilidade com `mongodb://localhost:27017/test` (dev/test) e
  `mongodb+srv://...` sem parâmetros.
- Seguir rigorosamente o padrão de `docs/admin-credential-security.md`
  para nunca vazar segredo no doc de auditoria.
- `PortfolioWorkModel.metadata.clientName` (PII) permanece como
  scaffolding unwired e não removido — risco residual documentado, não
  endereçado nesta tarefa.
- Nenhum risco de regressão em autenticação/CSRF/cookies.

## Implementation Steps

1. Inspecionar `src/data/models/*.model.ts` e confirmar o inventário de
   exposição de dados descrito em "Current Architecture".
2. Implementar `assertMongoUriEnforcesTls` (ou extensão equivalente de
   `assertMongoUriShape`) em `src/infra/config/env.ts`, chamada
   incondicionalmente em todo `NODE_ENV`.
3. Adicionar os quatro casos de teste descritos em "Testing Strategy"
   ao spec existente de `env.ts`.
4. Criar `docs/mongodb-atlas-security-audit.md` cobrindo FR-001 a
   FR-009, com citações de arquivo/linha como evidência e a tabela de
   conformidade final (FR-009/AC-009).
5. Criar `specs/CARSHOP-137/operator-checklist.md` no formato de
   `specs/CARSHOP-43/operator-checklist.md`.
6. Atualizar o comentário sobre `MONGO_URI` em `.env.example`.
7. Opcionalmente referenciar o novo documento de auditoria em
   `README.md`.
8. Rodar `npm test` e `npm run build`; considerar `npm run test:e2e`.

## Definition of Done Mapping

| Item do DoD | Requisito | Artefato |
|---|---|---|
| Network access (restrito vs. aberto) | FR-001 / AC-001 | `docs/mongodb-atlas-security-audit.md` + `specs/CARSHOP-137/operator-checklist.md` |
| Privilégio do database user | FR-002 / AC-002 | `docs/mongodb-atlas-security-audit.md` + `operator-checklist.md` |
| TLS obrigatório | FR-003 / AC-003 | `docs/mongodb-atlas-security-audit.md` + `src/infra/config/env.ts` (nova validação) |
| Encryption at rest | FR-004 / AC-004 | `docs/mongodb-atlas-security-audit.md` + `operator-checklist.md` |
| Exposição desnecessária de dados | FR-005 / AC-005 | `docs/mongodb-atlas-security-audit.md` (inventário de models) |
| RLS não aplicável | FR-006 / AC-006 | `docs/mongodb-atlas-security-audit.md` |
| "Public key" não aplicável | FR-007 / AC-007 | `docs/mongodb-atlas-security-audit.md` |
| Field-level encryption | FR-008 / AC-008 | `docs/mongodb-atlas-security-audit.md` |
| Tabela de conformidade | FR-009 / AC-009 | `docs/mongodb-atlas-security-audit.md` |
| Ausência de segredo real em artefatos versionados | NFR-001 / AC-010 | Todos os artefatos criados/modificados |
| Rastreabilidade (citação de arquivo/linha) | NFR-002 | `docs/mongodb-atlas-security-audit.md` |
| Local consistente com convenção do projeto | NFR-003 | `docs/mongodb-atlas-security-audit.md` |

## Open Non-Blocking Questions

- Esta auditoria deve produzir apenas documentação (`docs/`), ou também
  código de verificação automatizada (ex.: script `verify:tls`)? —
  Resolvida pelo architect: reforçar a validação de startup existente
  em `env.ts` é suficiente; nenhum script `verify:tls` standalone será
  criado.
- Os requisitos completos de CARSHOP-36 e CARSHOP-42 (não recuperados)
  podem revelar sobreposição ou dependência adicional com esta task;
  não bloqueante para esta implementação.
