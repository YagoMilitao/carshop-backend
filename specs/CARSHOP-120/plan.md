# CARSHOP-120 — Implementation Plan

## Source

Specification:
`specs/CARSHOP-120/spec.md`

## Architect Verdict

READY FOR IMPLEMENTATION

## Objective

Adicionar um passo explícito e bloqueante de lint (check-only, sem
`--fix`) ao job `test-and-sonar` em `.github/workflows/sonar-backend.yml`,
posicionado antes do passo "SonarCloud scan", de forma que qualquer
violação que hoje faz `npm run lint` retornar exit code diferente de zero
interrompa o job antes do scan Sonar.

Mapeamento de cobertura de requisitos:

- FR-001 → AC-002, AC-004
- FR-002 → AC-001, AC-002
- FR-003 → AC-001, AC-003
- FR-004 → AC-003
- NFR-002, NFR-003, NFR-004 → cobertos pela forma de implementação do
  step

FR-005/FR-006/AC-005 são atividades de processo pós-merge (medição
contínua de divergência entre revisão interna e Codex Review/SonarCloud),
fora do escopo de código desta mudança.

## Current Architecture

- Job único existente `test-and-sonar` em
  `.github/workflows/sonar-backend.yml`, sem múltiplos jobs e sem
  `needs:`.
- `actions/setup-node` já configurado com `node-version: 20` (linhas
  25-27), herdado por todos os steps do mesmo job.
- `npm run lint` hoje é `eslint "{src,test}/**/*.ts" --fix` (confirmado
  em `package.json`, linha 18) — roda com auto-fix, o que mascararia
  violações se usado diretamente em CI.
- Nenhum step do job atual tem `continue-on-error: true` e não há `if:`
  que ignore falhas; o job é linear.
- `eslint.config.mjs` (flat config) já suporta a invocação sem flags
  adicionais.

## Proposed Solution

1. Adicionar um novo script `lint:check` em `package.json`, com o mesmo
   glob do script `lint` existente, porém sem `--fix` (modo somente
   checagem).
2. Inserir um novo step "Lint check (no auto-fix)" no job
   `test-and-sonar`, executando `npm run lint:check`, posicionado
   imediatamente após "Run E2E tests" e antes de "SonarCloud scan" (entre
   as linhas atuais 58 e 67 do YAML atual).
3. Não usar `continue-on-error` no novo step — o comportamento padrão do
   GitHub Actions (falha do step interrompe o job e pula steps
   subsequentes) já garante o bloqueio exigido por FR-003.

## Technical Decisions

### Decision

Criar um script novo e dedicado `lint:check` em `package.json`:
`"lint:check": "eslint \"{src,test}/**/*.ts\""` (mesmo glob do script
`lint` existente, sem `--fix`), em vez de reutilizar o script `lint`
diretamente no CI ou invocar `eslint` inline no YAML.

### Reason

`npm run lint` hoje é `eslint "{src,test}/**/*.ts" --fix` (confirmado em
`package.json`, linha 18); rodar esse comando no CI mascararia violações
via auto-fix em vez de falhar o job. Um script dedicado documenta a
intenção de checagem, evita duplicar o glob diretamente no YAML e
permanece reproduzível localmente pelo desenvolvedor.

### Alternatives Considered

- Reutilizar `npm run lint` (com `--fix`) diretamente no CI — rejeitado,
  pois mascararia violações em vez de falhar o build.
- Invocar `eslint` inline no step do YAML, duplicando o glob — rejeitado,
  pois duplica configuração e dificulta reprodução local idêntica.

### Trade-offs

Um script npm adicional a manter em paralelo ao script `lint` existente;
mitigado pelo fato de ambos compartilharem o mesmo glob-alvo e a
diferença ficar restrita à flag `--fix`.

---

### Decision

Inserir o novo step "Lint check (no auto-fix)" dentro do job único
existente `test-and-sonar`, imediatamente após "Run E2E tests" e antes de
"SonarCloud scan" (entre as linhas atuais 58 e 67 do YAML atual), sem
`continue-on-error`.

### Reason

O workflow já possui um único job linear (`test-and-sonar`), sem
`needs:` entre múltiplos jobs. Inserir o step nesse ponto garante que o
lint rode antes do scan do SonarCloud (FR-002) e que uma falha de lint
impeça a execução do scan (FR-003), aproveitando o comportamento padrão
do GitHub Actions sem necessidade de configuração adicional.

### Alternatives Considered

- Criar um job dedicado para lint com `needs:` — rejeitado por
  desnecessário, dado que o job único já é linear e suficiente; aumentaria
  complexidade sem benefício adicional.

### Trade-offs

Nenhum trade-off relevante identificado; a abordagem segue o precedente
estrutural já usado neste mesmo arquivo para adicionar o step de
`test:e2e`.

---

### Decision

Não adicionar `continue-on-error` nem qualquer `if:` que ignore falhas no
novo step; confiar no comportamento padrão do GitHub Actions.

### Reason

Nenhum step do job atual usa `continue-on-error: true` nem `if:` que
ignore falhas; o job é linear. O comportamento padrão (falha de step
interrompe o job e pula steps seguintes) já é suficiente para atender
FR-003 sem configuração extra.

### Alternatives Considered

Nenhuma alternativa relevante — usar `continue-on-error: true` foi
descartado de imediato, pois contradiria diretamente o requisito de
bloqueio (FR-003) e o objetivo da task.

### Trade-offs

Nenhum.

---

### Decision

Não alterar a versão do Node.js usada pelo job.

### Reason

O job já usa `actions/setup-node` com `node-version: 20` (linhas 25-27),
herdado por todos os steps do mesmo job, incluindo o novo step de lint.
ADR-015 (Node pinado em `sonar-backend.yml`) permanece válido e
compatível, sem necessidade de mudança.

### Alternatives Considered

Nenhuma — não há motivo identificado para alterar a versão do Node.

### Trade-offs

Nenhum.

## Execution Flow

```text
checkout
    ↓
setup-node (node 20)
    ↓
install dependencies
    ↓
... steps existentes (build/testes unitários/E2E) ...
    ↓
Run E2E tests
    ↓
Lint check (no auto-fix)  ← novo step (npm run lint:check)
    ↓
SonarCloud scan
```

## Files

### Files to Create

Nenhum arquivo novo.

### Files to Modify

- `package.json`: adicionar script `lint:check` (check-only, sem
  `--fix`); o script `lint` existente permanece intocado.
- `.github/workflows/sonar-backend.yml`: inserir step "Lint check (no
  auto-fix)" rodando `npm run lint:check`, entre "Run E2E tests" e
  "SonarCloud scan", sem `continue-on-error`.

Nenhum outro arquivo de código-fonte, Swagger, ou teste unitário precisa
mudar.

## Contract Impact

Nenhum. Não há rota, controller, contrato HTTP ou schema alterado.

## Persistence Impact

Nenhum.

## Security Impact

- Nenhum segredo, credencial ou valor real de variável de ambiente é
  adicionado, exposto ou logado pela mudança (NFR-001).
- `security.md` se aplica apenas negativamente: confirmado que nenhum
  segredo novo é referenciado.

## Swagger Impact

Nenhum. A mudança é exclusivamente de CI (workflow YAML) mais 1 linha de
script npm; não há rota/controller/contrato/schema alterado, portanto
`openapi.md`, `controllers.md` e `persistence.md` não se aplicam.

## Testing Strategy

Mudança de infraestrutura CI (YAML + 1 script npm), sem lógica de negócio
em `src/**/*.ts`. Exceção à política de cobertura de `>= 80%` enquadrada
como **"Not applicable"** (arquivo de configuração/pipeline sem lógica
unit-testável), conforme critérios de exceção de `.claude/rules/testing.md`.

Validação proposta para developer/tester:

1. Rodar `npm run lint:check` localmente no estado atual do repositório e
   confirmar exit code 0 antes de commitar.
2. Confirmar por leitura do YAML que o step está posicionado antes de
   "SonarCloud scan" e sem `continue-on-error`.
3. Validação funcional real do gate (AC-001) só é observável em execução
   real do Actions (PR de teste ou primeira execução pós-merge) —
   registrar como validação operacional/manual, não como cobertura de
   código.
4. Rodar `npm run build` e `npm test` normalmente para garantir que a
   alteração em `package.json` não quebra nada.

## Risks

- PRs abertos antes do merge podem passar a falhar no gate se tiverem
  violações de lint pré-existentes — mitigado pelo fato de
  `.claude/agents/developer.md` já rodar lint com `--fix` antes de
  entregar o trabalho.
- Nenhuma regressão esperada nos gates existentes (`npm audit`,
  `test:coverage`, `test:e2e`, Sonar Quality Gate) — apenas um step
  adicional é inserido antes do scan (NFR-002).
- Nenhum segredo novo é referenciado pelo comando de lint.
- A comparação qualitativa de divergência (FR-005/AC-005) depende de
  julgamento humano sobre gravidade dos achados, podendo gerar avaliações
  inconsistentes entre PRs (risco de processo, já registrado na
  especificação).

## Implementation Steps

1. Adicionar o script `lint:check` em `package.json` (mesmo glob do
   script `lint`, sem `--fix`).
2. Inserir o step "Lint check (no auto-fix)" em
   `.github/workflows/sonar-backend.yml`, rodando `npm run lint:check`,
   entre "Run E2E tests" e "SonarCloud scan", sem `continue-on-error`.
3. Rodar `npm run lint:check`, `npm run build` e `npm test` localmente
   para validar que nada quebrou.
4. Confirmar por leitura do YAML final que o posicionamento e a ausência
   de `continue-on-error` estão corretos.

## Definition of Done Mapping

- FR-001 (step de lint check-only no CI) → satisfeito pela criação do
  script `lint:check` e do novo step no workflow.
- FR-002 (lint antes do Sonar scan) → satisfeito pelo posicionamento do
  step entre "Run E2E tests" e "SonarCloud scan".
- FR-003 (falha de lint bloqueia o job) → satisfeito pela ausência de
  `continue-on-error` e pelo comportamento padrão do GitHub Actions.
- FR-004 (falha reportada de forma visível) → satisfeito pelo nome
  distinto do step ("Lint check (no auto-fix)") e pela saída padrão do
  comando no log do Actions.
- FR-005/FR-006/AC-005 (medição contínua de divergência) → fora do
  escopo de código desta task; tratados como atividade de processo
  pós-merge, conforme a especificação.
- NFR-001 (sem segredos novos) → satisfeito; nenhum segredo referenciado.
- NFR-002 (gates existentes preservados) → satisfeito; apenas um step é
  inserido, nenhum gate existente é removido ou enfraquecido.
- NFR-003 (modo checagem, sem `--fix`) → satisfeito pelo script
  `lint:check` dedicado.
- NFR-004 (step identificável separadamente) → satisfeito pelo nome de
  step distinto.

## Open Non-Blocking Questions

(Herdadas de `specs/CARSHOP-120/spec.md`, já resolvidas pelas decisões de
arquitetura acima, registradas aqui para rastreabilidade)

- Sintaxe/posicionamento exato do novo step dentro de
  `sonar-backend.yml` (mesmo job `test-and-sonar` ou job dedicado) —
  resolvido: mesmo job, sem job dedicado (ver Decision 2).
- Uso de `--max-warnings=0` versus exit code padrão de `npm run lint` —
  resolvido: o script `lint:check` usa o mesmo comportamento de exit code
  do ESLint já existente (sem flag adicional de warnings), suficiente
  para atender FR-003.
- Número/percentual-alvo formal para "redução de divergência" — não
  definido pela task; tratado como critério qualitativo de processo
  (FR-005/FR-006/AC-005), fora do escopo desta mudança.
