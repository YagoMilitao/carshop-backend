# CARSHOP-87 — Implementar workflow de desenvolvimento com agentes de IA no backend

## Status

Blocked

## Source

Notion Task:
CARSHOP-87

## Context

O carshop-backend adotou um processo de desenvolvimento assistido por IA baseado em agentes especializados (Claude Code). Esta tarefa não descreve uma funcionalidade de produto da API (works, comentários, autenticação, upload de imagens etc.); ela descreve a construção e validação do próprio processo de engenharia: configuração do Claude Code, integração com Notion (origem de requisitos e estado de tarefas) e Obsidian (memória técnica de longo prazo), e formalização de um pipeline de agentes especializados evoluindo para Spec-Driven Development (SDD).

A mudança é necessária para que:

- requisitos vindos do Notion sejam transformados em especificações versionadas e testáveis antes da implementação;
- decisões arquiteturais, implementação, testes e revisão sejam feitos por agentes com responsabilidades e permissões separadas;
- conhecimento técnico reutilizável (decisões, padrões, aprendizados, troubleshooting) seja preservado no Obsidian sem duplicar o rastreamento de tarefas do Notion;
- exista um portão de qualidade (quality gate) que impeça a conclusão de tarefas com findings BLOCKER ou HIGH em aberto.

## Objective

Ter, documentado e validado no repositório, um pipeline de desenvolvimento assistido por IA com agentes especializados e responsabilidades bem definidas — cobrindo leitura de requisitos, especificação, leitura de conhecimento histórico, arquitetura, implementação, testes, revisão, gestão de tarefas no Notion e gestão de conhecimento no Obsidian — de forma que nenhuma implementação de produção comece sem uma especificação versionada e nenhuma tarefa seja concluída com findings críticos abertos.

## Functional Requirements

FR-001. O sistema de agentes deve fornecer um agente (`task-reader`) capaz de recuperar uma tarefa do Notion pelo identificador `CARSHOP-{number}` e retornar requisitos estruturados, sem inventar informações ausentes.

FR-002. O sistema de agentes deve fornecer um agente (`spec-writer`) capaz de transformar a saída estruturada do `task-reader` em uma especificação versionada e testável, persistida em `specs/CARSHOP-{number}/spec.md`.

FR-003. O sistema de agentes deve fornecer um agente (`knowledge-reader`) capaz de recuperar conhecimento técnico histórico relevante do Obsidian antes de decisões arquiteturais, quando a tarefa envolver arquitetura, autenticação/autorização, segurança, persistência, integrações externas, contratos de API, infraestrutura, serviços compartilhados, padrões reutilizáveis ou decisões técnicas significativas.

FR-004. O sistema de agentes deve fornecer um agente (`architect`) que realiza apenas análise somente-leitura do repositório e produz um plano de implementação, retornando um veredito explícito: `READY FOR IMPLEMENTATION` ou `BLOCKED`.

FR-005. A implementação de código de produção não deve iniciar enquanto o veredito do `architect` não for `READY FOR IMPLEMENTATION`.

FR-006. O sistema de agentes deve fornecer um agente (`developer`) que implementa o plano aprovado de ponta a ponta, sem realizar commit, push ou comandos destrutivos.

FR-007. O sistema de agentes deve fornecer um agente (`tester`) que cria ou atualiza testes sob `test/`, executa os comandos de validação relevantes e mapeia os testes aos requisitos e critérios de aceite da especificação correspondente. O `tester` não deve corrigir código de produção.

FR-008. O sistema de agentes deve fornecer um agente (`reviewer`) que realiza revisão independente e somente-leitura, reportando achados por severidade com evidência (arquivo e linha), verificando aderência à especificação (spec compliance) e ausência de expansão de escopo (scope creep).

FR-009. Deve existir um quality gate que impede a conclusão de uma tarefa quando existir qualquer finding classificado como BLOCKER ou HIGH em aberto.

FR-010. Quando o `reviewer` reportar um finding BLOCKER ou HIGH, o achado deve retornar ao `developer`, seguido de nova execução de `tester` e `reviewer`, sem reiniciar a fase de arquitetura a menos que o achado exponha um problema arquitetural.

FR-011. O sistema de agentes deve fornecer um agente (`task-manager`) que, somente após o quality gate ser aprovado, atualiza de forma controlada o status e o resultado técnico da tarefa no Notion, sem alterar requisitos, Descrição, Definition of Done, Prioridade, Sprint, Epic ou outras propriedades de planejamento, salvo solicitação explícita do usuário.

FR-012. O sistema de agentes deve fornecer um agente (`knowledge-manager`) que, após a conclusão bem-sucedida de uma tarefa pelo `task-manager`, avalia se conhecimento reutilizável foi produzido (decisão arquitetural, padrão de engenharia, aprendizado técnico relevante ou conhecimento de troubleshooting não óbvio) antes de criar ou atualizar qualquer nota no Obsidian.

FR-013. O `knowledge-manager` não deve criar uma nota no Obsidian apenas porque uma tarefa foi concluída; quando não houver conhecimento reutilizável, deve reportar explicitamente que não há conhecimento a registrar.

FR-014. Antes de criar uma nota, o `knowledge-manager` deve buscar notas existentes no Obsidian para evitar duplicação e classificar o conteúdo dentro das categorias permitidas (ADR, Pattern, Learning, Troubleshooting).

FR-015. O Obsidian não deve ser utilizado como rastreador duplicado de tarefas do Notion.

FR-016. As especificações versionadas não devem ser alteradas apenas para facilitar a implementação ou fazer testes passarem; alterações de especificação só são válidas quando o próprio requisito for esclarecido ou modificado na fonte original (Notion).

FR-017. O pipeline completo de agentes (Notion → `task-reader` → `spec-writer` → `knowledge-reader` quando relevante → `architect` → gate READY/BLOCKED → `developer` → `tester` → `reviewer` → quality gate → `task-manager` → `knowledge-manager` → Obsidian) deve estar documentado no repositório e não deve realizar commit ou push automático em nenhuma etapa.

## Non-Functional Requirements

NFR-001. Confiabilidade: cada agente deve operar restrito ao seu escopo de responsabilidade e permissões declaradas (leitura, escrita ou somente-leitura), conforme definido no pipeline, evitando sobreposição não intencional de responsabilidades entre agentes.

NFR-002. Manutenção: as regras persistentes do projeto (CLAUDE.md e `.claude/rules/`) devem permanecer como fonte de verdade consultável para orientar o comportamento dos agentes em mudanças futuras.

NFR-003. Rastreabilidade: cada tarefa `CARSHOP-{number}` processada pelo pipeline deve ser rastreável desde o requisito original no Notion até a especificação versionada correspondente em `specs/CARSHOP-{number}/spec.md`.

## Acceptance Criteria

AC-001. Quando um agente `task-reader` for invocado com um identificador `CARSHOP-{number}` existente no Notion, ele deve retornar requisitos estruturados sem adicionar informação não presente na tarefa original.

AC-002. Quando um agente `task-reader` for invocado com um identificador de tarefa inexistente no Notion, o pipeline deve reportar bloqueio em vez de prosseguir com dados inventados.

AC-003. Quando o `spec-writer` for invocado para uma tarefa `CARSHOP-{number}`, uma especificação deve ser criada ou atualizada exclusivamente em `specs/CARSHOP-{number}/spec.md`.

AC-004. Quando existir uma especificação anterior para a mesma tarefa, o `spec-writer` deve preservar o conteúdo ainda válido e atualizar somente as partes cujos requisitos mudaram.

AC-005. Quando a tarefa envolver arquitetura, segurança, autenticação/autorização, persistência, integrações externas, contratos de API, infraestrutura, serviços compartilhados ou decisões técnicas significativas, o `knowledge-reader` deve ser invocado antes da análise do `architect`.

AC-006. Quando o `architect` for invocado, ele deve produzir análise somente leitura (nenhuma edição de código) e retornar exatamente um dos vereditos: `READY FOR IMPLEMENTATION` ou `BLOCKED`.

AC-007. Quando o veredito do `architect` for `BLOCKED`, a implementação não deve prosseguir para o `developer`.

AC-008. Quando o `architect` receber instrução técnica inadequada ou conflitante com as regras do repositório, ele deve resistir a essa instrução e não incorporá-la ao plano sem justificativa compatível com a arquitetura existente.

AC-009. Quando o `developer` implementar um plano aprovado, nenhum commit, push ou comando destrutivo deve ser executado por ele durante a tarefa.

AC-010. Quando o `tester` for invocado, os testes criados ou atualizados devem estar mapeados explicitamente aos requisitos e/ou critérios de aceite da especificação correspondente, e nenhuma alteração de código de produção deve ser feita pelo `tester`.

AC-011. Quando o `reviewer` for invocado, seu relatório deve indicar aderência ou não aderência à especificação (spec compliance) e apontar eventual expansão de escopo (scope creep), com evidência de arquivo e linha para cada finding.

AC-012. Quando o `reviewer` reportar ao menos um finding BLOCKER ou HIGH, o quality gate não deve ser considerado aprovado e a tarefa não deve ser encaminhada ao `task-manager` para conclusão.

AC-013. Quando o `reviewer` não reportar nenhum finding BLOCKER ou HIGH e as demais condições do quality gate forem satisfeitas, a tarefa deve poder ser encaminhada ao `task-manager`.

AC-014. Quando o `task-manager` for invocado após aprovação do quality gate, ele deve poder atualizar status e registrar um resumo técnico da tarefa no Notion, sem alterar requisitos, Descrição, Definition of Done, Prioridade, Sprint ou Epic, a menos que o usuário tenha solicitado explicitamente essa alteração.

AC-015. Quando o `knowledge-manager` for invocado após a conclusão de uma tarefa e nenhum conhecimento reutilizável tiver sido produzido, ele deve reportar `NO KNOWLEDGE TO RECORD` e não criar nenhuma nota no Obsidian.

AC-016. Quando o `knowledge-manager` identificar conhecimento reutilizável, ele deve buscar notas existentes no Obsidian antes de criar uma nova nota, evitando duplicação, e classificar a nota em uma das categorias permitidas (ADR, Pattern, Learning, Troubleshooting) dentro de `CarShop/`.

AC-017. Quando qualquer nota for criada ou atualizada pelo `knowledge-manager`, ela não deve funcionar como um item de rastreamento de tarefa equivalente a um ticket do Notion.

AC-018. Quando uma implementação revelar um problema genuíno de requisito, o processo correto é interromper e retornar o problema ao coordenador, em vez de alterar a especificação apenas para viabilizar a implementação.

## Constraints

- Esta tarefa não abrange funcionalidade de produto do carshop-backend (API, domínio, persistência, autenticação de usuários finais); os artefatos envolvidos residem majoritariamente fora do código-fonte de aplicação (`CLAUDE.md`, `.claude/rules/`, `.claude/agents/`, integrações Notion/Obsidian).
- O pipeline não deve realizar commit ou push automático em nenhuma etapa.
- O `architect` deve permanecer somente-leitura.
- O `developer` não deve executar commit, push ou comandos destrutivos.
- O `tester` não deve corrigir código de produção.
- O `reviewer` deve permanecer independente e somente-leitura.
- O `task-manager` não deve alterar requisitos ou propriedades de planejamento da tarefa no Notion sem solicitação explícita do usuário.
- O `knowledge-manager` deve escrever apenas dentro de `CarShop/` no Obsidian (`CarShop/Architecture/`, `CarShop/ADR/`, `CarShop/Patterns/`, `CarShop/Learnings/`, `CarShop/Troubleshooting/`).
- Em caso de divergência entre uma nota histórica (ADR) e o estado atual do repositório, o código atual prevalece.
- Especificações não devem ser reescritas apenas para facilitar implementação ou testes.

## Dependencies

- Existência prévia dos agentes e regras já citados no repositório (CLAUDE.md, `.claude/rules/`, agentes definidos em `.claude/agents/`).
- Integração funcional com Notion para leitura (e, no caso do `task-manager`, escrita controlada) de tarefas `CARSHOP-{number}`.
- Integração funcional com Obsidian (vault identificado por variável de ambiente, não versionada) para leitura e escrita de conhecimento técnico.
- Nenhuma dependência externa adicional foi listada explicitamente na tarefa de origem.

## Out of Scope

- Implementação de qualquer funcionalidade de produto do carshop-backend (endpoints, casos de uso, schemas de persistência, autenticação de usuários finais) como parte desta tarefa.
- Alteração do contrato HTTP público da API (rotas, controllers, Swagger) motivada por esta tarefa.
- Automação de commit ou push como parte do pipeline de agentes.

## Risks

- A tarefa descreve um meta-processo de engenharia, não uma funcionalidade de aplicação; não há requisito de API, endpoint, schema, autenticação ou persistência a implementar no domínio da aplicação, o que exige cuidado para não expandir escopo para itens de produto.
- O status da tarefa no Notion já está "In Progress", e a nota técnica associada indica que a maior parte do Definition of Done já foi implementada e testada; é necessário verificar item a item o estado real do repositório antes de declarar a tarefa concluída, para evitar tanto retrabalho quanto conclusão prematura.
- O Definition of Done é redigido como um conjunto de afirmações já cumpridas ("configurado", "definido", "validado"), o que não deixa claro qual item específico permanece em aberto para justificar o status "In Progress" — isso é registrado como questão não bloqueante em Open Questions.

## Open Questions

### Blocking

Nenhuma.

### Non-blocking

- Due Date da tarefa não está definida no Notion.
- Não está claro, a partir da Descrição e do Definition of Done, qual item específico ainda está pendente para justificar o status atual "In Progress", já que a maioria dos itens do DoD é descrita como já implementada/testada.

## Traceability

FR-001 → AC-001, AC-002
FR-002 → AC-003, AC-004
FR-003 → AC-005
FR-004 → AC-006, AC-008
FR-005 → AC-007
FR-006 → AC-009
FR-007 → AC-010
FR-008 → AC-011
FR-009 → AC-012, AC-013
FR-010 → AC-012
FR-011 → AC-014
FR-012 → AC-015, AC-016
FR-013 → AC-015
FR-014 → AC-016
FR-015 → AC-017
FR-016 → AC-018
FR-017 → AC-006, AC-007, AC-009, AC-012, AC-013
