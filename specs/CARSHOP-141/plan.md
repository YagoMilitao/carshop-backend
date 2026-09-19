# CARSHOP-141 — Implementation Plan

## Source

Specification:
`specs/CARSHOP-141/spec.md`

## Architect Verdict

READY FOR IMPLEMENTATION

## Objective

Auditoria de segurança do armazenamento/verificação da credencial admin, com
documentação obrigatória (FR-001/002/003/008, AC-001/002/007), seguida
condicionalmente de correção de código apenas se a auditoria encontrar (a)
senha reutilizável persistida em texto puro, ou (b) comparação de
credencial persistida sem hashing adaptativo (FR-004/005, AC-003). Exige
também confirmação de que nenhuma resposta de API ou log expõe
senha/hash (FR-006/007, AC-005/006) e testes cobrindo login válido/inválido
sem vazar segredo (AC-004).

## Current Architecture

Verdade fundamental confirmada no repositório:

1. Origem da credencial (FR-001): `EnvAdminCredentialsProvider`
   (`src/infra/config/env-admin-credentials.provider.ts`) lê
   `process.env.ADMIN_EMAIL`/`process.env.ADMIN_PASSWORD` e é a única
   implementação de `AdminCredentialsProviderPort`
   (`src/core/domain/application/Auth/admin-credentials-provider.port.ts`)
   instanciada no composition root (`src/infra/server.ts:78-88`) e injetada
   em `AuthService`.
2. Comparação (FR-002): `AuthService.validateAdmin`
   (`src/core/domain/application/Auth/auth.service.ts:84-99`) compara
   e-mail e senha recebidos contra os valores retornados pelo provider
   usando `safeEquals`, que usa `timingSafeEqual` de `node:crypto` —
   comparação de texto puro em tempo constante, não comparação de hash,
   porque não há hash persistido para comparar.
3. Nenhuma persistência de senha reutilizável em texto puro
   (FR-003/AC-002): `AdminUserModel`
   (`src/data/models/admin-user.model.ts`) só é referenciado em seu
   próprio arquivo, em `src/main/create-indexes.ts` (script genérico
   apenas aditivo), e em seu spec isolado. Não existe nenhum caminho de
   código que grave (`.create`/`.save`) um `AdminUserModel`. `bcrypt` não
   está em `package.json`. Não há trajeto de persistência de senha admin
   em uso — nem em texto puro, nem em hash. A comparação ocorre
   inteiramente em memória contra a variável de ambiente.
4. `AdminUserModel` é scaffolding futura intencional, não trabalho
   abandonado: comentário no schema (`admin-user.model.ts:4-9`) declara
   explicitamente que é preparação para futura migração de admin via
   `.env` para autenticação por banco. Ausência de wiring + comentário
   auto-documentado confirmam: é scaffolding preparatória isolada, fora
   do fluxo real de autenticação.
5. FR-004/FR-005/AC-003 não se aplicam no estado atual: não existe
   trajeto de persistência de credencial admin em uso.
6. Nenhum vazamento de senha/hash em resposta de API (FR-006/AC-005):
   `AuthController` — login/refresh retornam
   `{ accessToken, csrfToken, sessionId, tokenType }`; logout retorna
   `{ success: true }`; getSession retorna
   `{ sessionId, email, expiresAt }`. Nenhum inclui senha ou hash.
7. Nenhum vazamento em log (FR-007/AC-006): `middleware.ts` usa
   `morgan('combined'|'dev')`, sem log de corpo de requisição.
   `error-handler.middleware.ts` trata `HttpError` devolvendo apenas
   `{ message, details }`; `validateAdmin` nunca interpola a senha
   recebida em string de erro.
8. AC-004(a)/(b) já cobertos por
   `test/unit/core/domain/application/Auth/auth.service.spec.ts:35-45`.
   AC-004(c) satisfeito estruturalmente.

### Conflito com conhecimento histórico

Nenhum — `knowledge-reader` não encontrou ADR/nota relevante; decisão
greenfield validada apenas pelo código-fonte.

## Proposed Solution

Documentação + testes de confirmação (sem mudança de comportamento).

Decisão: NÃO é necessária mudança de código em `auth.service.ts`,
`admin-credentials-provider.port.ts` ou `admin-user.model.ts`. A auditoria
confirma o cenário do FR-003 (conformidade), não FR-004
(não-conformidade a corrigir). Corrigir implementando hashing bcrypt para
`AdminUserModel` agora introduziria uma segunda estratégia de
credenciais fora do escopo desta task (Out of Scope do spec).

Novo arquivo `docs/admin-credential-security.md` (seguindo padrão de
`docs/dependency-vulnerability-policy.md`, `docs/sonar-quality-gate.md`)
contendo:

- Origem da credencial (nomes de variável apenas: `ADMIN_EMAIL`,
  `ADMIN_PASSWORD`) via `EnvAdminCredentialsProvider` implementando
  `AdminCredentialsProviderPort`.
- Mecanismo de comparação: `AuthService.validateAdmin` → `safeEquals`
  (`timingSafeEqual`), texto puro em tempo constante contra valor em
  memória — nunca contra documento persistido.
- Declaração explícita (FR-003/AC-002): nenhuma senha reutilizável do
  admin é persistida em texto puro; validação ocorre inteiramente em
  runtime.
- Esclarecimento sobre `AdminUserModel`/`passwordHash`: scaffolding
  preparatória para futura migração, não conectada ao fluxo de login
  atual, referenciada apenas genericamente em `create-indexes.ts`, sem
  caminho de escrita ativo.
- Declaração explícita da ausência de política de custo/rotação de hash
  (FR-008/AC-007): não existe credencial persistida em hash hoje;
  portanto não há política de custo/rotação de bcrypt a documentar
  agora. Migração futura deve definir isso em sua própria task.
- Confirmação de FR-006/FR-007 com referência aos arquivos/linhas como
  evidência.

Atualização leve do `README.md` — seção "Segurança": adicionar frase
curta com link para `docs/admin-credential-security.md`, sem duplicar
conteúdo nem alterar comportamento documentado.

Não tocar em `CLAUDE.md`.

## Technical Decisions

### Decision

Não realizar mudança de código em `auth.service.ts`,
`admin-credentials-provider.port.ts` ou `admin-user.model.ts`; produzir
apenas documentação (`docs/admin-credential-security.md`) e uma
atualização leve no `README.md`.

### Reason

A auditoria confirma que a credencial admin nunca é persistida em texto
puro nem em hash: a comparação ocorre inteiramente em memória contra
`ADMIN_EMAIL`/`ADMIN_PASSWORD` via `EnvAdminCredentialsProvider` e
`safeEquals` (`timingSafeEqual`). Isso corresponde ao cenário de
conformidade do FR-003, não ao cenário de não-conformidade do FR-004.

### Alternatives Considered

Implementar hashing bcrypt para `AdminUserModel` proativamente.

### Trade-offs

Implementar bcrypt para `AdminUserModel` agora introduziria uma segunda
estratégia de credenciais fora do escopo desta task (explicitamente
listado em Out of Scope do spec), sem necessidade real identificada pela
auditoria.

## Execution Flow

1. Confirmar (fonte de verdade: repositório) a origem, comparação e
   ausência de persistência da credencial admin — já realizado pela
   análise do architect e registrado em "Current Architecture" acima.
2. Criar `docs/admin-credential-security.md` com o conteúdo descrito em
   "Proposed Solution".
3. Adicionar referência curta em `README.md` (seção "Segurança") para o
   novo documento.
4. Opcionalmente reforçar um teste em `auth.service.spec.ts` para
   AC-004(c).
5. Nenhuma alteração em Swagger; nenhum `test:e2e` adicional necessário.

## Files

### Files to Create

- `docs/admin-credential-security.md`

### Files to Modify

- `README.md` — referência/link leve na seção "Segurança".
- `test/unit/core/domain/application/Auth/auth.service.spec.ts` —
  opcional, teste de reforço para AC-004(c).

Sem alteração: `src/core/domain/application/Auth/auth.service.ts`,
`src/core/domain/application/Auth/admin-credentials-provider.port.ts`,
`src/infra/config/env-admin-credentials.provider.ts`,
`src/data/models/admin-user.model.ts`, `src/infra/server.ts`, qualquer
arquivo Swagger, qualquer rota/controller.

## Contract Impact

Nenhum. Nenhuma mudança de contrato HTTP.

## Persistence Impact

Nenhum. Nenhuma alteração em modelo de dados.

## Security Impact

Nenhuma mudança de comportamento de segurança. A task documenta e
confirma o estado de segurança já existente (nenhuma senha reutilizável
persistida em texto puro; comparação em tempo constante via
`timingSafeEqual`; nenhuma exposição de senha/hash em resposta de API ou
log).

## Swagger Impact

Nenhum. Sem mudança de contrato HTTP.

## Testing Strategy

Testes (confirmação, não correção):

- `auth.service.spec.ts`: casos AC-004(a)/(b) já existem; nenhuma
  alteração obrigatória. Opcionalmente adicionar teste que capture o
  `HttpError` de `validateAdmin('admin@example.com', 'wrong')` e afirme
  que `error.message` ('Credenciais inválidas.') não contém a senha
  usada no teste nem qualquer hash.
- Nenhum teste novo de `bcrypt.compare` necessário (FR-005/AC-003 não se
  aplicam).
- Nenhuma alteração em Swagger necessária — sem mudança de contrato
  HTTP.
- Nenhum `test:e2e` adicional necessário (NFR-003 preservado).

### Estratégia de cobertura de teste (>= 80% novo/alterado)

Não se aplica (exceção "Not applicable" per `.claude/rules/testing.md`):
nenhuma linha de produção nova/alterada neste plano. `auth.service.ts`,
`admin-credentials-provider.port.ts`, `env-admin-credentials.provider.ts`
e `admin-user.model.ts` permanecem inalterados. Escopo é documentação +
confirmação de comportamento existente, não lógica de negócio nova. O
teste opcional de reforço, se adicionado, valida comportamento
observável real e não conta como produção alterada.

## Risks

- Risco residual documentado (não corrigido nesta task): modelo de
  admin único via env não suporta rotação de credencial sem redeploy nem
  múltiplos admins — fora de escopo, não é não-conformidade da política
  atual.
- Risco de confusão futura sobre `AdminUserModel` mitigado pela
  documentação proposta.
- NFR-003 preservado por construção.

## Implementation Steps

1. Criar `docs/admin-credential-security.md` cobrindo: origem da
   credencial, mecanismo de comparação, declaração de conformidade
   FR-003/AC-002, esclarecimento sobre `AdminUserModel`, declaração de
   ausência de política de custo/rotação de hash (FR-008/AC-007), e
   confirmação de FR-006/FR-007 com evidência de arquivos/linhas.
2. Atualizar `README.md` (seção "Segurança") com referência curta ao
   novo documento.
3. Opcionalmente reforçar `auth.service.spec.ts` com teste para
   AC-004(c).
4. Nenhuma alteração de código de produção, Swagger, contrato HTTP,
   persistência ou fluxo de autenticação.

## Definition of Done Mapping

- FR-001 → documentado em `docs/admin-credential-security.md` (origem
  da credencial).
- FR-002 → documentado em `docs/admin-credential-security.md`
  (mecanismo de comparação).
- FR-003 → registrado como evidência de conformidade em
  `docs/admin-credential-security.md`; nenhuma segunda estratégia de
  credenciais introduzida.
- FR-004 → não aplicável no estado atual (nenhum trajeto de persistência
  de credencial em uso); declarado explicitamente na documentação.
- FR-005 → não aplicável no estado atual; declarado explicitamente na
  documentação.
- FR-006 → confirmado via inspeção de `AuthController`; documentado com
  evidência.
- FR-007 → confirmado via inspeção de `middleware.ts` e
  `error-handler.middleware.ts`; documentado com evidência.
- FR-008 → declaração explícita de ausência de política de
  custo/rotação de hash, já que não há credencial persistida em hash
  hoje.
- AC-001 → satisfeito por `docs/admin-credential-security.md`.
- AC-002 → satisfeito pela busca no código-fonte documentada em
  "Current Architecture"; nenhum achado divergente.
- AC-003 → não aplicável (nenhum trajeto de persistência de credencial
  em uso).
- AC-004 → (a)/(b) já cobertos por `auth.service.spec.ts:35-45`; (c)
  satisfeito estruturalmente, com reforço opcional de teste.
- AC-005 → confirmado por inspeção de `AuthController`.
- AC-006 → confirmado por inspeção dos formatos de log.
- AC-007 → satisfeito pela declaração explícita de ausência de
  credencial persistida em hash em `docs/admin-credential-security.md`.

## Open Non-Blocking Questions

- Confirmar, durante a fase de arquitetura/implementação, se o modelo de
  dados de usuário administrador existente no repositório está de fato
  conectado ao fluxo de login atual ou se é uma estrutura preparatória
  ainda não utilizada. Já resolvido pela análise do architect nesta
  plan: é scaffolding preparatória, não conectada ao fluxo real (ver
  "Current Architecture", item 4).

## Bloqueios

Nenhum.
