# CARSHOP-17 — Configurar rate limit específico para comentários

## Status

Ready

## Source

Notion Task:
CARSHOP-17

## Context

O endpoint público de criação de comentários (`POST /works/:workId/comments`)
não possui nenhuma proteção contra spam além do rate limit global já
existente na aplicação. Como qualquer visitante pode enviar comentários sem
autenticação, esse endpoint é um alvo natural para automações que tentam
submeter grandes volumes de comentários em curto espaço de tempo.

A aplicação já usa `express-rate-limit` como estratégia de rate limiting
(ver o rate limiter global e o rate limiter dedicado de `POST /auth/login`).
Este é o padrão a ser seguido; não deve haver reintrodução de padrões do
NestJS (`@nestjs/throttler`, decorators), já removidos na migração para
Express.

## Objective

Adicionar um rate limiter dedicado, mais restritivo que o rate limit global,
aplicado apenas na rota de criação de comentários, de modo a mitigar spam
sem impedir o uso legítimo do formulário de comentários por um visitante
comum.

## Functional Requirements

FR-001: A API deve aplicar um rate limiter dedicado à rota
`POST /works/:workId/comments`, distinto do rate limiter global da
aplicação.

FR-002: O rate limiter dedicado a comentários deve contabilizar requisições
por IP do cliente.

FR-003: Quando o número de requisições de criação de comentário de um mesmo
IP exceder o limite configurado dentro da janela de tempo configurada, a API
deve responder com status HTTP `429`.

FR-004: A resposta HTTP `429` retornada pelo limiter de comentários deve
conter um corpo com mensagem informando que o limite de tentativas foi
excedido, seguindo o mesmo formato de mensagem já usado pelos limiters
existentes (ex.: `{ "message": "..." }`).

FR-005: O rate limiter dedicado a comentários não deve ser aplicado
globalmente nem em nenhuma outra rota além de `POST /works/:workId/comments`.
Em particular, não deve afetar `GET /works/:workId/comments` (listagem de
comentários aprovados) nem qualquer rota de `works`.

FR-006: O rate limiter global existente deve continuar sendo aplicado
normalmente a todas as rotas, incluindo as de comentários, de forma
cumulativa e independente do novo limiter dedicado. Este comportamento
cumulativo é consistente com o padrão já adotado pelo rate limiter de
`POST /auth/login`, que também coexiste com o rate limiter global.

## Non-Functional Requirements

NFR-001: A configuração de janela de tempo e quantidade máxima de
requisições do limiter de comentários é uma decisão de implementação, não
fixada por este documento (ver "Open Questions — Non-blocking"). Qualquer
que seja o valor escolhido, ele deve ser:
  - mais restritivo (janela e/ou limite) que o rate limiter global da
    aplicação (atualmente 15 minutos / 100 requisições por IP); e
  - suficientemente permissivo para não bloquear o uso legítimo e normal do
    formulário de comentários por um único visitante (ex.: um visitante
    enviando um comentário ocasional não deve ser bloqueado).

NFR-002: A implementação deve reutilizar o mecanismo de rate limiting já
existente no projeto (`express-rate-limit`), seguindo o mesmo padrão de
criação de limiters dedicados já usado para `POST /auth/login`. Nenhuma
nova dependência deve ser introduzida.

NFR-003: A implementação não deve reintroduzir padrões do NestJS
(`@nestjs/throttler`, decorators de throttling ou equivalentes).

NFR-004: O rate limiter de comentários não deve registrar, logar ou expor
em mensagens de erro qualquer dado sensível do requisitante (ex.: não deve
expor o IP bruto do cliente na mensagem de resposta ao usuário).

## Acceptance Criteria

AC-001: Dado um cliente que realiza requisições `POST` para
`/works/:workId/comments` a partir do mesmo IP dentro da janela de tempo
configurada, quando o número de requisições ultrapassa o limite
configurado, a API responde com status HTTP `429` e um corpo contendo uma
mensagem de erro.

AC-002: Dado um cliente que realiza requisições `POST` para
`/works/:workId/comments` a partir do mesmo IP, quando o número de
requisições está dentro do limite configurado, a API processa cada
requisição normalmente (não retorna `429`).

AC-003: Dado o rate limiter dedicado de comentários configurado, quando um
cliente realiza requisições em qualquer outra rota da aplicação (por
exemplo, `GET /works/:workId/comments` ou rotas de `auth`), o limiter
dedicado de comentários não é acionado e não influencia o resultado dessas
outras rotas.

AC-004: Dado o rate limit global já existente, quando requisições são
enviadas para `POST /works/:workId/comments`, tanto o rate limiter global
quanto o rate limiter dedicado de comentários continuam ativos de forma
independente (ambos contam a requisição), sem que a introdução do limiter
dedicado remova, substitua ou duplique a configuração do limiter global.

AC-005: Dado dois clientes distintos identificados por IPs diferentes,
quando um deles excede o limite de requisições de comentário, apenas esse
IP recebe `429`; o outro cliente continua podendo enviar comentários
normalmente.

## Constraints

- Não alterar o rate limiter global existente (`globalRateLimitMiddleware`
  ou equivalente).
- Não alterar autenticação, autorização, CSRF ou qualquer outro endpoint
  fora de `POST /works/:workId/comments`.
- Não introduzir novas dependências; usar `express-rate-limit`, já presente
  no projeto.
- Não reintroduzir padrões do NestJS.
- O identificador usado para limitar (IP) não deve expor dados pessoais do
  requisitante em mensagens de erro ou logs.

## Dependencies

- Rate limit global do Express já configurado (pré-requisito existente,
  fora do escopo desta task).
- Rota pública `POST /works/:workId/comments` já implementada
  (`CommentController.create` / `CreateCommentUseCase`).

## Out of Scope

- Alterar o valor, a janela ou o comportamento do rate limiter global.
- Adicionar rate limit a qualquer outra rota (works, auth, admin/comments,
  admin/works, upload de imagens) além de `POST /works/:workId/comments`.
- Adicionar autenticação ou CAPTCHA ao endpoint de comentários.
- Alterar a lógica de negócio de criação ou aprovação de comentários.
- Persistir ou expor métricas de rate limiting fora do escopo do
  middleware.

## Risks

- Um limite mal calibrado pode bloquear visitantes legítimos que enviam
  comentários com frequência razoável (ex.: usuários atrás de um mesmo IP
  compartilhado/NAT corporativo).
- Um limite excessivamente permissivo pode não mitigar efetivamente o spam
  que motivou esta task.

## Open Questions

### Blocking

Nenhuma.

### Non-blocking

- O valor exato de janela de tempo e quantidade máxima de requisições do
  limiter de comentários não foi especificado no Notion. Cabe ao developer
  definir esse valor com base nos padrões já existentes no repositório
  (ex.: o limiter dedicado de `POST /auth/login`), respeitando NFR-001
  (mais restritivo que o global, sem bloquear uso legítimo normal), e
  documentar a escolha e a justificativa no código (comentário) e/ou no
  resumo de implementação, seguindo o padrão de comentários explicativos já
  usado em `rate-limit.middleware.ts`.

## Traceability

FR-001 → AC-001, AC-004
FR-002 → AC-001, AC-005
FR-003 → AC-001
FR-004 → AC-001
FR-005 → AC-003
FR-006 → AC-004
NFR-001 → AC-001, AC-002
NFR-002 → AC-004
NFR-003 → (implementação, verificável por revisão de código)
NFR-004 → AC-001
