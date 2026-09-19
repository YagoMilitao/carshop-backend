# CARSHOP-137 — Checklist Manual do Operador (MongoDB Atlas)

## Aviso

Este é um checklist **manual**, de responsabilidade exclusiva do
**operador humano**. Nenhum item deste documento é executável,
verificável ou simulável por qualquer agente deste workflow
(`task-reader`, `spec-writer`, `architect`, `developer`, `tester`,
`reviewer`, `task-manager`, `knowledge-manager` ou qualquer outro).
Nenhum agente possui acesso ao painel de administração do MongoDB
Atlas. Este documento complementa
`docs/mongodb-atlas-security-audit.md` para os itens do Definition of
Done de `specs/CARSHOP-137/spec.md` que não são verificáveis a partir
do repositório (FR-001, FR-002 e a confirmação do tier de FR-004), e
não deve conter nenhum valor real de segredo — apenas nomes de
variáveis e instruções, conforme `.claude/rules/spec-security.md`.

Este artefato não substitui `specs/CARSHOP-137/spec.md` nem
`docs/mongodb-atlas-security-audit.md`, e não altera o conteúdo de
nenhum dos dois.

## 1. Network Access (FR-001 / AC-001)

- [ ] **1.1** No painel do Atlas (Network Access → IP Access List),
      confirmar se o acesso ao cluster está restrito a uma lista
      específica de IPs/CIDRs conhecidos (ex.: os IPs de saída do
      provedor de hospedagem/deploy usado em produção).
- [ ] **1.2** Caso o acesso esteja aberto amplamente (`0.0.0.0/0`),
      registrar essa constatação e avaliar restringir a lista às
      origens estritamente necessárias, evitando `0.0.0.0/0` em
      produção.
- [ ] **1.3** Não registrar, neste arquivo ou em qualquer artefato
      versionado, nenhum IP real, CIDR real ou identificador de
      cluster real — apenas a constatação (restrito/aberto) e a
      recomendação, se aplicável.

## 2. Database User — Privilégio Mínimo (FR-002 / AC-002)

- [ ] **2.1** No painel do Atlas (Database Access → Database Users),
      identificar o papel (role) concedido ao usuário de banco de
      dados usado pela aplicação para conectar-se via `MONGO_URI`.
- [ ] **2.2** Confirmar se o papel segue o princípio de menor
      privilégio — por exemplo, `readWrite` escopado apenas ao(s)
      database(s) necessário(s) à aplicação — em vez de papéis
      administrativos amplos (ex.: `atlasAdmin`,
      `dbAdminAnyDatabase`, `readWriteAnyDatabase`).
- [ ] **2.3** Caso o papel exceda o escopo necessário, registrar essa
      constatação e avaliar restringi-lo ao(s) database(s) realmente
      usado(s) pela aplicação.
- [ ] **2.4** Não registrar, neste arquivo ou em qualquer artefato
      versionado, nenhum nome de usuário real, senha real ou
      credencial real — apenas o nome do papel (role) concedido.

## 3. TLS (FR-003 / AC-003)

- [ ] **3.1** No painel do Atlas (Database Deployment → cluster →
      configurações de conexão), confirmar que não há nenhuma flag ou
      configuração de cluster desabilitando TLS/SSL para conexões
      recebidas.
- [ ] **3.2** Confirmar que a `MONGO_URI` configurada como secret no
      provedor de hospedagem/deploy (ex.: Render) não contém
      `tls=false` nem `ssl=false` na query string — o startup da
      aplicação já rejeita esse caso automaticamente
      (`src/infra/config/env.ts`, `assertMongoUriEnforcesTls`), mas
      esta é uma confirmação adicional e independente diretamente
      contra o valor real configurado no provedor.
- [ ] **3.3** Não copiar o valor de `MONGO_URI` para este arquivo ou
      para qualquer outro artefato versionado durante a verificação.

## 4. Encryption at Rest (FR-004 / AC-004)

- [ ] **4.1** Confirmar, no painel do Atlas, qual tier de cluster está
      efetivamente em uso em produção (item apenas informativo — todos
      os tiers do Atlas, incluindo M0, oferecem criptografia em
      repouso nativamente, sem configuração adicional necessária por
      parte da aplicação).
- [ ] **4.2** Registrar a constatação (tier em uso) sem incluir
      nenhum identificador de cluster real neste arquivo.

## Registro de Execução

Este documento não é preenchido automaticamente. Ao concluir a
conferência manual, o operador deve registrar, fora deste repositório
(ex.: no sistema de gestão de tarefas, como comentário no Notion), a
data da execução e o resultado de cada seção, sem copiar nenhum valor
real de variável de ambiente, IP, hostname ou credencial para este
arquivo ou para qualquer outro artefato versionado.
