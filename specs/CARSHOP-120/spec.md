# CARSHOP-120 — Reduzir divergência entre revisão interna (reviewer) e achados do Codex Review / SonarCloud

## Status

Ready

## Source

Notion Task:
CARSHOP-120

## Context

O Codex Review e o SonarCloud frequentemente apontam problemas (bugs, code
smells, security hotspots) que o agente `reviewer` do fluxo interno não
capturou antes da entrega. Uma investigação anterior identificou a causa
raiz: nenhum agente do fluxo (`developer`, `tester`, `reviewer`) executava
ESLint antes da entrega, apesar de o projeto ter regras de análise estática
com sobreposição direta com o que Sonar/Codex checam (por exemplo, regras
type-checked do `@typescript-eslint`). Além disso, o workflow de CI
(`.github/workflows/sonar-backend.yml`) não possui, hoje, um passo explícito
de lint antes do scan do SonarCloud — o lint atualmente só roda
manualmente/localmente via `npm run lint`.

Duas partes do trabalho já foram concluídas em uma iteração anterior e não
devem ser refeitas:

- `.claude/agents/reviewer.md`: passo de lint somente-leitura (checagem via
  ESLint, nunca com auto-fix) e seção "Static Analysis Parity".
- `.claude/agents/developer.md`: passo obrigatório de rodar lint (com
  auto-fix) antes de entregar o trabalho.

Esta especificação cobre o escopo restante: adicionar um gate de lint
explícito e bloqueante ao workflow de CI, e formalizar a atividade de
comparação/medição de divergência que ocorre em PRs subsequentes.

## Objective

Garantir que problemas de lint sejam detectados e bloqueiem o pipeline de CI
antes do scan do SonarCloud, de forma independente do comportamento dos
agentes do fluxo interno (`developer`, `tester`, `reviewer`), reduzindo a
divergência entre o que é encontrado internamente e o que é reportado pelo
Codex Review / SonarCloud Quality Gate.

## Functional Requirements

FR-001 — O workflow de CI que executa o scan do SonarCloud para o backend
deve incluir um passo explícito que execute a verificação de lint do
projeto (equivalente a `npm run lint`) em modo somente checagem (sem
auto-fix e sem modificar arquivos versionados).

FR-002 — O passo de lint definido em FR-001 deve ser executado antes do
passo de scan do SonarCloud, dentro do mesmo workflow de CI.

FR-003 — Caso o passo de lint identifique qualquer violação que hoje faça
`npm run lint` retornar código de saída diferente de zero (incluindo, no
mínimo, `error`; o tratamento de `warning` cabe à decisão de arquitetura
sobre a flag de bloqueio equivalente a `--max-warnings=0` ou similar), o
job de CI correspondente deve falhar e impedir a conclusão bem-sucedida do
workflow, independentemente do resultado do scan do SonarCloud.

FR-004 — A falha do passo de lint deve ser reportada de forma visível no
resultado do workflow de CI (por exemplo, na saída do job/step, na aba de
Checks do PR), permitindo que o autor do PR identifique a causa da falha.

FR-005 (medição contínua — processo, não código) — Após a implementação do
gate de lint, para pelo menos 2 a 3 PRs subsequentes que passem pelo fluxo
completo (`developer` → `tester` → `reviewer`), deve ser registrada uma
comparação entre a quantidade/gravidade dos achados do Codex Review e o
resultado do Quality Gate do SonarCloud, antes e depois da mudança
introduzida por esta task.

FR-006 (processo condicional) — Se a comparação de FR-005 indicar que a
divergência entre revisão interna e Codex Review/SonarCloud persiste, o
arquivo `.claude/agents/reviewer.md` deve ser revisado novamente como
follow-up, fora do escopo de código desta task.

## Non-Functional Requirements

NFR-001 (Segurança) — Nenhuma credencial, segredo, token ou valor real de
variável de ambiente pode ser adicionado, exposto ou logado como parte da
alteração no workflow de CI. Apenas nomes de variáveis/segredos já
existentes podem ser referenciados.

NFR-002 (Não regressão de escopo) — A alteração no workflow de CI não deve
remover, enfraquecer ou tornar não bloqueantes os gates de qualidade já
existentes no workflow (testes unitários, testes E2E, auditoria de
dependências, Quality Gate do SonarCloud).

NFR-003 (Consistência de comportamento) — O passo de lint adicionado ao
workflow de CI deve operar em modo estritamente de checagem (sem
`--fix` ou equivalente), preservando a mesma restrição já aplicada ao passo
de lint do agente `reviewer` (não mutar arquivos que não deveria tocar).

NFR-004 (Manutenibilidade) — O passo de lint no workflow de CI deve ser
identificável separadamente dos demais passos (nome de step distinto),
permitindo diagnóstico independente de falhas de lint versus falhas de
outros gates.

## Acceptance Criteria

AC-001 — Dado o workflow de CI do backend, quando o código contiver uma
violação de lint que hoje causaria `npm run lint` a falhar (exit code
diferente de zero), então o job de CI deve falhar no passo de lint, antes
de qualquer tentativa de execução do passo de scan do SonarCloud.

AC-002 — Dado o workflow de CI do backend, quando o código não contiver
nenhuma violação de lint bloqueante, então o passo de lint deve concluir
com sucesso e o workflow deve prosseguir normalmente para os passos
subsequentes (incluindo o scan do SonarCloud).

AC-003 — Quando o passo de lint falhar, o log/summary do workflow deve
exibir informação suficiente (nome do step, saída do comando) para que o
autor do PR identifique que a falha foi causada pelo gate de lint, e não
por outro passo do pipeline (testes, auditoria de dependências, Sonar
Quality Gate).

AC-004 — O passo de lint adicionado não deve, em nenhuma execução do
workflow, modificar ou commitar arquivos do repositório (verificável pela
ausência de qualquer flag de auto-fix na invocação do comando e pela
ausência de alterações no working tree do runner de CI causadas por esse
passo).

AC-005 (medição contínua, verificação fora deste code change) — Para pelo
menos 2 a 3 PRs subsequentes ao merge desta mudança, deve existir um
registro documentado (nas Notas Técnicas da task no Notion) comparando
achados do Codex Review e resultado do Quality Gate do SonarCloud
antes/depois da mudança, concluindo se a divergência diminuiu ou
registrando explicitamente por que ela persiste.

## Constraints

- Não há definição objetiva de "redução da divergência" (número ou
  percentual alvo); o critério de avaliação em AC-005/FR-005 é qualitativo,
  por comparação relativa de achados antes/depois.
- A sintaxe exata do GitHub Actions (posição do novo step, nome do job,
  eventual necessidade de novo job dedicado) não está definida nesta
  especificação e é uma decisão de arquitetura/implementação, não um
  requisito de produto.
- O agente `reviewer` deve permanecer somente leitura / não deve se tornar
  mais bloqueante do que hoje; seu passo de lint já concluído em iteração
  anterior não deve ser duplicado ou alterado por esta task.
- Nenhum segredo, credencial ou valor real de `.env`/variável de ambiente
  pode ser introduzido no workflow de CI ou nesta especificação. Apenas
  nomes de variáveis já existentes (ex.: `SONAR_TOKEN`, `SONAR_PROJECT_KEY`,
  `SONAR_ORGANIZATION`) podem ser referenciados.

## Dependencies

- Script `npm run lint` já existente no projeto (ver `package.json`).
- Workflow de CI existente `.github/workflows/sonar-backend.yml`.
- Trabalho já concluído em `.claude/agents/reviewer.md` e
  `.claude/agents/developer.md` (pré-requisito funcional já satisfeito,
  não requer nova implementação).
- Processo de acompanhamento de PRs subsequentes e registro de Notas
  Técnicas no Notion, para as atividades de medição (FR-005/FR-006/AC-005),
  que ocorrem fora do ciclo de implementação desta task.

## Out of Scope

- Redefinir ou reescrever as regras do ESLint do projeto.
- Alterar o comportamento do agente `reviewer` além do que já foi
  implementado em iteração anterior (a menos que uma revisão futura,
  disparada por FR-006, decida o contrário).
- Definir um número/percentual-alvo objetivo de redução de divergência.
- Alterar os demais gates de qualidade já existentes no workflow (testes
  unitários, testes E2E, auditoria de dependências, Sonar Quality Gate)
  além de garantir que continuem intactos (NFR-002).
- Implementar ferramentas ou integrações adicionais de análise estática
  além do ESLint já existente no projeto.

## Risks

- Tornar o gate de lint bloqueante pode, inicialmente, causar falhas em
  PRs que ainda não passaram pelo fluxo atualizado de `developer`/
  `reviewer` (mitigação: já coberto pelo passo de lint com auto-fix no
  `developer.md`, mas PRs em andamento no momento do merge podem precisar
  de ajuste).
- A comparação qualitativa (FR-005/AC-005) depende de julgamento humano
  sobre gravidade dos achados, o que pode gerar avaliações inconsistentes
  entre PRs.

## Open Questions

### Blocking

(nenhuma)

### Non-blocking

- Qual a sintaxe/posicionamento exato do novo step de lint dentro de
  `sonar-backend.yml` (mesmo job `test-and-sonar` ou job dedicado)? —
  decisão de arquitetura.
- Deve o gate usar `--max-warnings=0` ou apenas o exit code padrão de
  `npm run lint`? — decisão de arquitetura, desde que o resultado observável
  atenda FR-003.
- Existe um número/percentual-alvo formal para "redução de divergência"? —
  não definido pela task; tratado como critério qualitativo (ver
  Constraints).

## Traceability

FR-001 → AC-002, AC-004
FR-002 → AC-001, AC-002
FR-003 → AC-001, AC-003
FR-004 → AC-003
FR-005 → AC-005
FR-006 → AC-005

NFR-001 → AC-004
NFR-002 → AC-002
NFR-003 → AC-004
NFR-004 → AC-003
