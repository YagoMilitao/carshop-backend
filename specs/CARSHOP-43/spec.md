# CARSHOP-43 — Revisar variáveis e secrets em produção

## Status

Ready

## Source

Notion Task:
CARSHOP-43

## Context

Erros comuns em deploy são variáveis de ambiente faltando e secrets
vazados. Esta tarefa visa reduzir esse risco revisando a configuração de
variáveis de ambiente e secrets utilizadas em produção.

Parte do escopo original desta tarefa depende de acesso a dashboards de
plataformas externas (Render, Vercel), que nenhum agente deste workflow
pode acessar. Esta especificação divide o trabalho em dois grupos:

1. **Requisitos verificáveis no repositório** — podem ser conferidos e,
   quando aplicável, cobertos por automação/testes dentro deste
   repositório.
2. **Requisitos fora do repositório** — dependem de acesso a consoles
   externos (Render, Vercel) e devem ser documentados como checklist
   manual do operador, não executável por um agente de implementação.

## Objective

Garantir que:

- nenhum secret real esteja versionado no estado atual ou no histórico do
  repositório;
- `.env` permaneça fora do controle de versão, incluindo o histórico do
  git;
- a validação de força de `JWT_SECRET` em produção exista e esteja
  efetivamente em vigor no código;
- nenhuma credencial do Cloudinary esteja hardcoded ou commitada no
  código-fonte;
- exista um checklist documentado e explícito para os itens que dependem
  de acesso externo (Render, Vercel), deixando claro que sua execução é
  responsabilidade manual do operador.

## Functional Requirements

### Repository-verifiable (dentro do escopo de implementação)

FR-001
O arquivo `.env` deve estar listado em `.gitignore` e não deve existir
como arquivo rastreado no índice ou no histórico do git deste
repositório.

FR-002
Nenhum valor real de secret (ex.: `JWT_SECRET`, `ADMIN_PASSWORD`,
`MONGO_URI` com credenciais, `CLOUDINARY_API_KEY`,
`CLOUDINARY_API_SECRET`) deve estar commitado em nenhum arquivo rastreado,
independentemente do caminho ou tipo, nem em qualquer revisão alcançável do
histórico git do repositório. Isso inclui, sem se limitar a, código-fonte,
testes, workflows, arquivos de configuração, `.env.example`, documentação e
todo o conteúdo sob `specs/`.

FR-003
`.env.example` pode listar apenas os NOMES das variáveis de ambiente
exigidas pela aplicação, nunca valores reais; valores de exemplo, quando
presentes, devem ser claramente fictícios.

FR-004
A validação de força de `JWT_SECRET` em produção, documentada no
`README.md` (mínimo de 32 caracteres quando `NODE_ENV=production`), deve
existir e estar efetivamente implementada e em vigor em
`src/infra/config/env.ts`.

FR-005
Nenhuma credencial do Cloudinary (`CLOUDINARY_CLOUD_NAME`,
`CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`) deve estar hardcoded em
código-fonte (`src/**`); essas credenciais devem ser lidas exclusivamente
via variáveis de ambiente.

### Out-of-repository (checklist manual do operador — não implementável por agente)

FR-006
Deve existir um checklist documentado, dentro da especificação, listando
explicitamente os itens que exigem conferência manual do operador nos
dashboards do Render e da Vercel (ex.: presença de todas as variáveis
obrigatórias configuradas, ausência de valores de exemplo/fracos em
produção, rotação de qualquer secret eventualmente exposto).

FR-007
O checklist do FR-006 deve declarar explicitamente que esses itens não
são verificáveis nem executáveis por um agente de implementação deste
workflow, por dependerem de acesso a consoles externos fora do escopo do
repositório.

## Non-Functional Requirements

NFR-001
Nenhuma execução de verificação (script, teste, comando manual) descrita
por esta especificação deve imprimir, logar, retornar ou persistir o
valor de um secret real. Mensagens de erro/relatório devem referenciar
apenas o nome da variável, nunca seu valor, conforme já praticado em
`src/infra/config/env.ts`.

NFR-002
Qualquer secret identificado como vazado (exposto em commit, log,
documentação ou histórico do git) deve ser tratado como incidente e
rotacionado imediatamente pelo operador; este requisito é operacional e
não bloqueia a conclusão dos itens verificáveis no repositório (FR-001 a
FR-005).

## Acceptance Criteria

AC-001
Ao executar uma busca no índice e no histórico do git por arquivos
chamados `.env` (excluindo `.env.example` e variações `*.example`),
nenhum resultado rastreado deve ser encontrado.

AC-002
Ao inspecionar `.gitignore`, a entrada `.env` deve estar presente.

AC-003
Ao executar uma varredura de secrets em todos os arquivos rastreados no estado
atual e em todas as revisões alcançáveis do histórico git, nenhum valor de
secret real (string com aparência de JWT secret, senha, API key/secret do
Cloudinary ou connection string com credenciais embutidas) deve ser encontrado.
A verificação deve abranger todos os caminhos e tipos de arquivo, incluindo
código-fonte, testes, workflows, arquivos de configuração, `.env.example`,
documentação e `specs/`; apenas nomes de variáveis ou valores explicitamente
fictícios são permitidos. O relatório da varredura pode identificar caminho,
revisão, regra acionada e resultado da análise, mas não pode reproduzir o valor
encontrado nem qualquer trecho que permita reconstruí-lo.

AC-004
Ao inspecionar `src/infra/config/env.ts`, deve existir uma validação que,
quando `NODE_ENV=production`, rejeita a inicialização da aplicação se
`JWT_SECRET` tiver menos de 32 caracteres, lançando um erro que referencia
apenas o nome da variável.

AC-005
Ao inspecionar `src/**`, nenhuma ocorrência de valor literal de credencial
do Cloudinary deve ser encontrada; todo acesso a essas credenciais deve
ocorrer via leitura de `process.env.CLOUDINARY_CLOUD_NAME`,
`process.env.CLOUDINARY_API_KEY` ou `process.env.CLOUDINARY_API_SECRET`
(diretamente ou através do módulo central de configuração de ambiente).

AC-006
Esta especificação (ou um artefato derivado dela, como a documentação de
implementação) deve conter um checklist explícito, com itens acionáveis,
cobrindo a conferência manual das variáveis de ambiente configuradas no
Render e na Vercel, marcado como responsabilidade do operador humano e
fora do escopo de execução automatizada deste workflow.

## Constraints

- Nenhum agente deste workflow possui acesso aos dashboards do Render ou
  da Vercel; portanto, nenhuma verificação real desses ambientes pode ser
  executada ou simulada como se tivesse sido executada.
- Nenhum valor real de secret pode ser lido, exibido, logado ou copiado
  para `specs/` ou qualquer outro artefato versionado, conforme
  `.claude/rules/spec-security.md` e `.claude/rules/security.md`.
- A verificação de força de `JWT_SECRET` documentada aqui refere-se
  apenas à existência e correção da regra de validação no código
  (`src/infra/config/env.ts`); não inclui a leitura do valor real
  configurado em produção.
- Rotação de secrets, quando necessária, é uma ação operacional externa
  ao repositório e não pode ser "implementada" por um agente de código.

## Dependencies

- Depende de um deploy anterior já realizado (conforme indicado no
  task-reader), já que a revisão de variáveis em Render/Vercel pressupõe
  que essas plataformas já estejam configuradas com um deploy existente.
- Depende da estrutura atual de validação de ambiente em
  `src/infra/config/env.ts`.

## Out of Scope

- Acesso, leitura ou alteração direta das configurações de variáveis de
  ambiente no Render ou na Vercel por qualquer agente deste workflow.
- Rotação efetiva de qualquer secret (essa ação é executada pelo
  operador fora do repositório, nunca pelo agente).
- Introdução de um novo mecanismo de gestão de secrets (ex.: vault
  externo) — não solicitado pela tarefa original.
- Alteração do conjunto de variáveis de ambiente exigidas pela aplicação,
  a menos que uma lacuna real seja encontrada durante a verificação
  descrita em FR-001 a FR-005.

## Risks

- Qualquer secret encontrado vazado durante a verificação deve ser
  tratado como incidente de segurança e rotacionado imediatamente pelo
  operador (conforme indicado no task-reader).
- A cobertura desta especificação sobre Render/Vercel é limitada a um
  checklist documental; a ausência de acesso a essas plataformas significa
  que a "Definition of Done" original ("Env completo, sem vazamento e
  aplicação estável") só pode ser parcialmente satisfeita por este
  workflow — a parte referente a Render/Vercel depende de confirmação
  manual do operador fora deste repositório.

## Open Questions

### Blocking

Nenhuma.

### Non-blocking

- Confirmação, pelo operador, de que a checklist de Render/Vercel (FR-006,
  FR-007, AC-006) foi de fato executada nos dashboards reais — não pode
  ser respondida por este workflow e não bloqueia a conclusão dos itens
  verificáveis no repositório.

## Traceability

FR-001 → AC-001, AC-002
FR-002 → AC-003
FR-003 → AC-003
FR-004 → AC-004
FR-005 → AC-005
FR-006 → AC-006
FR-007 → AC-006
NFR-001 → AC-003, AC-004, AC-005
NFR-002 → (risco operacional, não coberto por AC automatizável neste repositório)
