# CARSHOP-141 — Revisar armazenamento e verificação da credencial administrativa

## Status

Ready

## Source

Notion Task:
CARSHOP-141

## Context

O backend autentica um único administrador através de uma credencial
configurada via variáveis de ambiente (`ADMIN_EMAIL`/`ADMIN_PASSWORD`) e
comparada no fluxo de login (`AuthService.validateAdmin`). O projeto também
define, no modelo de dados, uma coleção Mongo dedicada a usuários
administradores com um campo de hash de senha, sugerindo um caminho futuro
de persistência de credencial em banco.

Antes de qualquer alteração, é necessário auditar formalmente:

1. de onde a credencial admin é lida hoje em runtime;
2. como ela é comparada (texto puro vs. hash);
3. se existe qualquer trajeto no código atual em que uma senha reutilizável
   do admin seja persistida (Mongo, logs, cache, etc.) em texto puro;
4. se, nos trajetos em que exista persistência de credencial, a comparação
   usa hashing adaptativo apropriado (ex.: bcrypt) e não criptografia
   reversível.

Esta task é fundamentalmente uma auditoria de segurança com documentação
obrigatória do fluxo atual. Alterações de código só são necessárias quando a
auditoria encontrar uma senha reutilizável persistida em texto puro, ou uma
comparação de credencial persistida que não use hashing adaptativo
apropriado.

## Objective

Garantir, com evidência documentada, que:

- nenhuma senha reutilizável do administrador é persistida em texto puro
  em qualquer armazenamento controlado pelo backend (banco de dados,
  arquivos, logs);
- quando existir credencial persistida, a verificação usa hashing
  adaptativo apropriado (bcrypt ou mecanismo equivalente já aprovado no
  projeto), nunca criptografia reversível;
- hashes de senha nunca são expostos pela API nem por logs;
- o fluxo atual de credencial admin (origem, comparação, política de
  custo/rotação do hash quando aplicável) está documentado de forma que
  outro desenvolvedor consiga entendê-lo sem precisar reler o código-fonte
  inteiro.

## Functional Requirements

- FR-001: O sistema deve documentar, em texto legível para desenvolvedores,
  a origem atual da credencial administrativa usada no fluxo de login (por
  exemplo: variável de ambiente, documento em banco de dados, ou outra
  fonte), incluindo o nome da porta/abstração responsável por fornecer essa
  credencial ao serviço de autenticação.

- FR-002: O sistema deve documentar como a credencial fornecida no login é
  comparada com a credencial de referência (por exemplo: comparação de
  texto puro em tempo constante, comparação via hash adaptativo, etc.).

- FR-003: Quando a auditoria identificar que nenhuma senha reutilizável do
  administrador é persistida em texto puro em nenhum armazenamento
  controlado pelo backend, o resultado deve ser registrado como evidência
  de conformidade, sem que uma segunda estratégia de credenciais seja
  introduzida apenas para satisfazer esta task.

- FR-004: Quando a auditoria identificar qualquer trajeto de código em que
  uma senha reutilizável do administrador seja ou passe a ser persistida em
  texto puro (Mongo, arquivo, cache, ou equivalente), esse trajeto deve ser
  corrigido para que a persistência use hashing adaptativo apropriado
  (bcrypt ou mecanismo equivalente já aprovado no projeto) em vez de texto
  puro ou de criptografia reversível.

- FR-005: Sempre que existir comparação contra uma credencial persistida
  (hash), a verificação deve usar a função de comparação apropriada ao
  mecanismo de hashing adaptativo utilizado (ex.: `bcrypt.compare` ou
  equivalente), preservando resistência a ataques de tempo onde aplicável.

- FR-006: Nenhuma resposta de API (sucesso ou erro) deve conter o valor
  puro da credencial, o hash de senha, ou qualquer derivado que permita
  reconstruir a senha.

- FR-007: Nenhuma linha de log gerada pelo backend (incluindo logs de
  requisição/resposta, logs de erro e stack traces) deve conter a
  credencial em texto puro ou o hash de senha.

- FR-008: A documentação produzida por esta task deve descrever a política
  de custo/rotação do hash de senha (por exemplo, fator de custo do bcrypt
  e orientação sobre rotação), quando existir credencial persistida em
  hash. Quando não existir credencial persistida em hash no fluxo atual,
  a documentação deve declarar explicitamente essa ausência em vez de
  inventar uma política.

## Non-Functional Requirements

- NFR-001 (Security): Nenhuma senha reutilizável do administrador deve
  poder ser recuperada em texto puro a partir de qualquer dado persistido
  pelo backend (banco de dados, arquivos, backups gerados pelo próprio
  fluxo de aplicação).

- NFR-002 (Security): Qualquer comparação de credencial persistida deve
  usar um algoritmo de hashing adaptativo com custo configurável (ex.:
  bcrypt), nunca um hash rápido de propósito geral (ex.: MD5, SHA-1,
  SHA-256 puro) nem criptografia simétrica/reversível.

- NFR-003 (Compatibility): A revisão desta task não deve alterar o modelo
  de token de acesso/refresh, sessão server-side ou proteção CSRF já
  existentes; qualquer mudança na verificação de credencial deve permanecer
  compatível com o restante do fluxo de autenticação.

- NFR-004 (Maintainability): O fluxo de credencial admin documentado deve
  permitir que um desenvolvedor identifique, sem inspecionar todo o
  código-fonte, onde a credencial é lida, como é comparada, e onde (se
  houver) está persistida.

## Acceptance Criteria

- AC-001: Existe documentação escrita descrevendo, em detalhe, a origem
  atual da credencial administrativa e o mecanismo de comparação usado no
  login.

- AC-002: Uma busca no código-fonte por trajetos de persistência de
  credencial administrativa (Mongo, arquivos, cache) não revela nenhuma
  senha reutilizável armazenada em texto puro; qualquer achado divergente é
  documentado como não-conformidade com plano de correção associado.

- AC-003: Quando existir um trajeto de persistência de credencial
  administrativa, a comparação correspondente usa uma função de hashing
  adaptativo (ex.: `bcrypt.compare`) comprovável por teste automatizado,
  e não uma comparação de texto puro nem uma rotina de descriptografia
  reversível.

- AC-004: Testes automatizados cobrem: (a) login com credencial correta
  retorna sucesso; (b) login com credencial incorreta retorna erro de
  autenticação; (c) nenhuma dessas asserções de teste imprime, loga, ou
  inclui no corpo da falha o valor real da senha ou do hash comparado.

- AC-005: Uma inspeção do corpo de resposta de sucesso e de erro do
  endpoint de login confirma que nenhum campo de hash de senha ou senha em
  texto puro é retornado ao cliente.

- AC-006: Uma inspeção dos formatos de log usados pelo backend confirma que
  nenhuma chamada de log inclui a credencial em texto puro ou o hash de
  senha.

- AC-007: A documentação da task declara explicitamente a política de
  custo/rotação do hash quando aplicável, ou declara explicitamente a
  ausência de credencial persistida em hash quando esse for o estado atual
  confirmado pela auditoria.

## Constraints

- Esta task não deve introduzir uma segunda estratégia de armazenamento de
  credenciais quando a estratégia atual já estiver em conformidade — o
  objetivo é auditar e documentar, não redesenhar sem necessidade.
- Nenhum valor real de `ADMIN_EMAIL`, `ADMIN_PASSWORD`, hash de senha, ou
  qualquer segredo real pode aparecer na documentação produzida, em
  commits, ou em `specs/`. Apenas nomes de variáveis de ambiente podem ser
  citados.
- Qualquer alteração de código decorrente da auditoria deve preservar o
  modelo existente de access token, refresh token, sessão server-side e
  proteção CSRF (fora do escopo direto desta task, mas adjacente).
- A decisão de QUAL mecanismo concreto usar (bcrypt vs. outro hashing
  adaptativo já aprovado no projeto) e ONDE exatamente no código a mudança
  ocorre é responsabilidade da fase de arquitetura/implementação, não desta
  especificação.

## Dependencies

- Fluxo de autenticação existente (`AuthService.validateAdmin` e a porta
  responsável por fornecer credenciais administrativas).
- Modelo de dados de usuário administrador, se a auditoria confirmar que
  ele está em uso pelo fluxo de autenticação real.
- Variáveis de ambiente `ADMIN_EMAIL` e `ADMIN_PASSWORD` (apenas os nomes,
  nunca os valores).

## Out of Scope

- Introdução de múltiplos usuários administradores ou de um fluxo de
  cadastro/self-service de administradores.
- Alteração do modelo de access/refresh token, sessão ou CSRF.
- Qualquer mudança na UI/frontend de login.
- Rotação automática agendada de credenciais (a menos que a auditoria
  identifique isso como não-conformidade ativa a corrigir).

## Risks

- Ambiguidade entre "credencial lida de variável de ambiente em runtime" e
  "credencial persistida em banco de dados": a tarefa no Notion está escrita
  de forma condicional ("quando houver senha persistida"), portanto o
  primeiro passo funcional é confirmar o comportamento real antes de
  decidir se alguma mudança de código é necessária.
- Caso a auditoria confirme que a comparação atual é feita diretamente
  contra a variável de ambiente (sem persistência em banco), o risco de
  "senha reutilizável persistida em texto puro" pode já estar mitigado por
  construção; isso deve ser tratado como evidência positiva, não como
  ausência de trabalho a fazer — a documentação continua sendo obrigatória.
- Existência de um modelo de dados de usuário administrador com campo de
  hash de senha que aparenta não estar conectado ao fluxo de autenticação
  real pode gerar confusão futura sobre qual é a fonte de verdade da
  credencial; isso deve ser esclarecido na documentação produzida por esta
  task.

## Open Questions

### Blocking

Nenhuma.

### Non-blocking

- Confirmar, durante a fase de arquitetura/implementação, se o modelo de
  dados de usuário administrador existente no repositório está de fato
  conectado ao fluxo de login atual ou se é uma estrutura preparatória
  ainda não utilizada. Isso deve ser resolvido inspecionando o repositório
  (fonte de verdade), não assumido a partir desta especificação.

## Traceability

FR-001 → AC-001
FR-002 → AC-001
FR-003 → AC-002
FR-004 → AC-002, AC-003
FR-005 → AC-003, AC-004
FR-006 → AC-005
FR-007 → AC-006
FR-008 → AC-007
