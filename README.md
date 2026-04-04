# Carshop Backend

API Node.js (Express + TypeScript) com arquitetura hexagonal para autenticação JWT baseada em `access token` + `refresh token`, rotação de sessão e proteção contra CSRF.

## Requisitos

- Node.js 20+
- npm

## Configuração

Defina as variáveis de ambiente abaixo antes de iniciar a aplicação:

```env
PORT=3000
ADMIN_EMAIL=admin@carshop.com
ADMIN_PASSWORD=123456
JWT_SECRET=uma-chave-forte
JWT_EXPIRES_IN=15m
JWT_REFRESH_EXPIRES_IN=7d
CORS_ORIGIN=http://localhost:3001
```

## Instalação

```bash
npm install
```

## Execução

```bash
npm run start:dev
```

## Documentação (Swagger)

Com a API rodando, a documentação OpenAPI fica disponível em:

- `GET /docs` (Swagger UI)
- `GET /docs.json` (spec OpenAPI em JSON)

## Arquitetura Hexagonal

O módulo de autenticação foi separado em quatro camadas:

- `domain`: entidades e portas (contratos de sessão, token e credenciais).
- `application`: regras de negócio da autenticação (`AuthService`).
- `infrastructure`: adapters concretos (JWT, store em memória, env provider).
- `interfaces/http`: rotas, controller e middlewares HTTP.

## Autenticação

### `POST /auth/login`

Autentica o administrador configurado e cria uma sessão.

Body:

```json
{
  "email": "admin@carshop.com",
  "password": "123456"
}
```

Resposta:

```json
{
  "accessToken": "jwt-access-token",
  "sessionId": "uuid-da-sessao",
  "tokenType": "Bearer"
}
```

Cookies retornados:

- `refresh_token`: cookie `HttpOnly`, usado apenas para renovar sessão.
- `csrf_token`: cookie legível pelo cliente, usado no padrão double-submit.

### `POST /auth/refresh`

Rotaciona `access token`, `refresh token` e `csrf_token`.

Headers:

- `X-CSRF-Token: <valor do cookie csrf_token>`

Cookies obrigatórios:

- `refresh_token`
- `csrf_token`

### `POST /auth/logout`

Revoga a sessão atual e remove os cookies de autenticação.

Headers:

- `X-CSRF-Token: <valor do cookie csrf_token>`

### `GET /auth/session`

Endpoint protegido pelo middleware JWT. Exige:

```http
Authorization: Bearer <accessToken>
```

Resposta:

```json
{
  "sessionId": "uuid-da-sessao",
  "email": "admin@carshop.com",
  "expiresAt": "2026-03-30T12:00:00.000Z"
}
```

## Segurança

- `refresh token` trafega em cookie `HttpOnly` com `SameSite=Strict`.
- Proteção CSRF por double-submit cookie em `refresh` e `logout`.
- Sessões armazenadas no servidor com revogação explícita no logout.
- Middleware JWT valida assinatura, tipo do token e status da sessão antes de liberar acesso.

## Testes

```bash
npm test
npm run test:coverage
npm run test:e2e
```

O comando `npm run test:coverage` gera a cobertura dos testes unitários no diretório `coverage/`, incluindo o arquivo `coverage/lcov.info`, usado pela análise do Sonar.
