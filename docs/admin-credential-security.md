# Segurança da Credencial Administrativa

## Contexto

Este documento registra o resultado de uma auditoria de segurança
(CARSHOP-141) sobre a origem, comparação e eventual persistência da
credencial usada para autenticar o administrador único do backend. O
objetivo é permitir que qualquer desenvolvedor entenda o fluxo completo
sem precisar reler todo o código-fonte, e deixar registrada a evidência
de conformidade encontrada.

## Origem da credencial (FR-001)

A credencial administrativa é lida a partir de variáveis de ambiente:

- `ADMIN_EMAIL`
- `ADMIN_PASSWORD`

(apenas os nomes das variáveis são citados aqui; os valores reais nunca
devem aparecer neste repositório, em specs, ou em qualquer documento
versionado.)

A leitura ocorre em `EnvAdminCredentialsProvider`
(`src/infra/config/env-admin-credentials.provider.ts`), a única
implementação existente da porta `AdminCredentialsProviderPort`
(`src/core/domain/application/Auth/admin-credentials-provider.port.ts`).
Essa porta é injetada no `AuthService`
(`src/core/domain/application/Auth/auth.service.ts`) pelo composition
root (`src/infra/server.ts`).

Não existe nenhuma outra fonte de credencial administrativa em uso no
fluxo de login atual.

## Mecanismo de comparação (FR-002)

`AuthService.validateAdmin` (`src/core/domain/application/Auth/auth.service.ts:84-99`)
compara o e-mail e a senha recebidos no login diretamente contra os
valores retornados pelo `AdminCredentialsProviderPort`, usando o método
privado `safeEquals` (`auth.service.ts:303-312`), que:

- converte ambos os valores em `Buffer`;
- rejeita imediatamente quando os tamanhos diferem;
- usa `timingSafeEqual` de `node:crypto` para a comparação em tempo
  constante quando os tamanhos são iguais.

Ou seja: é uma comparação de **texto puro em tempo constante**, feita
inteiramente em memória contra o valor retornado pelo provider — nunca
uma comparação de hash, e nunca uma comparação contra um documento
persistido em banco.

## Nenhuma senha reutilizável é persistida em texto puro (FR-003 / AC-002)

Uma busca no código-fonte por trajetos de persistência de credencial
administrativa confirma que **nenhum caminho de código grava a
credencial do admin** (nem em texto puro, nem em hash) em nenhum
armazenamento controlado pelo backend:

- A comparação de login ocorre inteiramente em memória, contra o valor
  retornado por `EnvAdminCredentialsProvider.getAdminCredentials()`
  (que apenas lê `process.env.ADMIN_EMAIL`/`process.env.ADMIN_PASSWORD`
  e retorna um objeto em memória — nenhuma chamada de escrita em banco,
  arquivo ou cache).
- Não existe nenhuma chamada `.create()`/`.save()`/`.insertMany()` (ou
  equivalente) contra `AdminUserModel` em nenhum lugar do repositório.
- `bcrypt` (ou qualquer outra biblioteca de hashing adaptativo) não é
  uma dependência do projeto (`package.json`).

Este é o cenário de conformidade previsto no FR-003 do spec: a credencial
nunca é persistida, portanto não há resultado de não-conformidade a
corrigir. Nenhuma segunda estratégia de armazenamento de credenciais foi
introduzida para "satisfazer" esta task.

## Esclarecimento sobre `AdminUserModel` / `passwordHash`

O repositório define, em `src/data/models/admin-user.model.ts`, um
schema Mongoose (`admin_users`) com um campo `passwordHash`. O próprio
comentário do arquivo (`admin-user.model.ts:4-9`) documenta a intenção:
scaffolding preparatória para uma futura migração da credencial de
`.env` para autenticação via banco de dados.

Esse modelo:

- **não é referenciado** por `AuthService`, `AuthController`,
  `EnvAdminCredentialsProvider`, ou por qualquer rota de autenticação
  ativa;
- é referenciado apenas de forma genérica em
  `src/main/create-indexes.ts`, um script standalone e apenas aditivo
  que garante índices declarados para **todos** os modelos Mongoose do
  repositório (inclusive modelos ainda não usados por nenhuma rota),
  sem nunca escrever um documento;
- não possui nenhum caminho de escrita ativo em produção.

Conclusão: `AdminUserModel`/`passwordHash` é infraestrutura preparatória
isolada, desconectada do fluxo real de login. Não deve ser confundido com
a fonte de verdade atual da credencial admin, que é exclusivamente
`ADMIN_EMAIL`/`ADMIN_PASSWORD` via `EnvAdminCredentialsProvider`.

## Política de custo/rotação de hash (FR-008 / AC-007)

**Não existe, hoje, credencial administrativa persistida em hash.** Como
consequência direta da conclusão acima, não há um fator de custo de
bcrypt (ou equivalente) configurado, nem uma política de rotação de hash
a documentar neste momento — não haveria hash algum para rotacionar.

Caso uma futura task implemente a migração da credencial admin para
persistência em banco (usando `AdminUserModel`), essa task deve, como
parte do seu próprio escopo, definir e documentar explicitamente:

- o algoritmo de hashing adaptativo usado (ex.: `bcrypt`);
- o fator de custo (`cost factor`/`salt rounds`) configurado;
- a política de rotação do hash (ex.: re-hash automático no login quando
  o fator de custo configurado for superior ao usado no hash
  armazenado).

## Nenhuma exposição de senha/hash em resposta de API (FR-006 / AC-005)

Inspeção de `src/presentation/controllers/auth.controller.ts` confirma
os corpos de resposta de cada endpoint de autenticação:

- `POST /auth/login` e `POST /auth/refresh`
  (`auth.controller.ts:43-48`, `auth.controller.ts:70-75`) retornam
  apenas `{ accessToken, csrfToken, sessionId, tokenType }`.
- `POST /auth/logout` (`auth.controller.ts:97`) retorna apenas
  `{ success: true }`.
- `GET /auth/session` (`auth.controller.ts:113-115`) retorna apenas
  `{ sessionId, email, expiresAt }`.

Nenhuma dessas respostas inclui senha em texto puro, hash de senha, ou
qualquer derivado que permita reconstruir a senha. Erros de credencial
inválida são tratados pelo `errorHandlerMiddleware`
(`src/infra/presentation/middleware/error-handler.middleware.ts:29-35`),
que devolve apenas `{ message, details }` de um `HttpError` já com
mensagem genérica (`'Credenciais inválidas.'`, definida em
`auth.service.ts:95`) — nunca a senha recebida.

## Nenhuma exposição de senha/hash em log (FR-007 / AC-006)

- `registerBaseMiddlewares` (`src/infra/config/middleware.ts:54`) usa
  `morgan('combined' | 'dev')`, que registra apenas metadados de
  requisição HTTP (método, path, status, tamanho, etc.) — não loga o
  corpo (`body`) da requisição, portanto nunca loga a senha enviada no
  login.
- `errorHandlerMiddleware`
  (`src/infra/presentation/middleware/error-handler.middleware.ts:54`)
  só executa `console.error(error)` para erros **inesperados** (não
  `HttpError`); o branch que trata `HttpError`
  (`error-handler.middleware.ts:29-35`, que é o único branch acionado
  por uma falha de `validateAdmin`) nunca chama `console.error` e nunca
  inclui a senha recebida.
- `AuthService.validateAdmin`
  (`src/core/domain/application/Auth/auth.service.ts:84-99`) nunca
  interpola a senha recebida em uma mensagem de erro, string de log, ou
  qualquer valor observável — a mensagem de erro é sempre a constante
  fixa `'Credenciais inválidas.'`.

## Resumo de conformidade

| Requisito | Estado |
|---|---|
| FR-001 (origem documentada) | Atendido — `ADMIN_EMAIL`/`ADMIN_PASSWORD` via `EnvAdminCredentialsProvider` |
| FR-002 (comparação documentada) | Atendido — `safeEquals`/`timingSafeEqual`, texto puro em tempo constante |
| FR-003 (nenhuma senha reutilizável em texto puro persistida) | Confirmado — nenhum caminho de escrita para `AdminUserModel` ou equivalente |
| FR-004 (correção de trajeto em texto puro) | Não aplicável — nenhum trajeto de persistência em uso |
| FR-005 (comparação via hash adaptativo quando houver persistência) | Não aplicável — nenhuma credencial persistida hoje |
| FR-006 (nenhuma exposição em resposta de API) | Confirmado — ver `AuthController` |
| FR-007 (nenhuma exposição em log) | Confirmado — ver `middleware.ts` e `error-handler.middleware.ts` |
| FR-008 (política de custo/rotação de hash) | Declarado explicitamente: não aplicável hoje; definição fica para task futura de migração |

Nenhuma alteração de código foi necessária como resultado desta
auditoria. O estado atual já está em conformidade com os requisitos de
segurança da credencial administrativa.
