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
ENABLE_SWAGGER=true
```

> Os valores acima são fictícios, apenas para desenvolvimento local. Em
> `NODE_ENV=production`, o startup da aplicação valida a força dessas
> configurações — veja "Segurança" abaixo — e rejeita, por exemplo,
> `ADMIN_PASSWORD=123456`.

## Banco de Dados (MongoDB Atlas)

A aplicação usa MongoDB via Mongoose, conectando-se através da variável de
ambiente `MONGO_URI`. Em produção, recomenda-se um cluster gerenciado no
MongoDB Atlas. Os passos abaixo são manuais, executados pelo operador fora
deste repositório, e usam apenas placeholders fictícios — nunca valores
reais:

1. **Criar/selecionar o cluster e o database**: no painel do MongoDB Atlas,
   crie (ou selecione) o projeto e o cluster de produção, e crie o database
   dedicado à aplicação (ex.: `<DATABASE_NAME>`).
2. **Criar um usuário de banco com privilégio mínimo**: crie um usuário de
   banco (`<DB_USER>`) com uma senha forte (`<DB_PASSWORD>`) e conceda
   apenas as permissões de leitura/escrita necessárias no database da
   aplicação — evite privilégios administrativos amplos.
3. **Restringir o Network Access (IP allowlist)**: em Atlas > Network
   Access, libere apenas os IPs/CIDRs de origem estritamente necessários
   (ex.: os IPs de saída do provedor de hospedagem/deploy usado em
   produção). Evite liberar `0.0.0.0/0` em produção.
4. **Obter a connection string**: no Atlas, obtenha a connection string no
   formato:

   ```text
   mongodb+srv://<DB_USER>:<DB_PASSWORD>@<CLUSTER_HOST>/<DATABASE_NAME>
   ```

   Substitua cada placeholder pelos valores reais do seu cluster; nunca
   copie um exemplo real para fora do cofre de segredos do provedor.

5. **Fornecer `MONGO_URI` como secret no provedor de hospedagem/deploy**: o
   valor resultante da connection string deve ser configurado
   exclusivamente através do mecanismo de variáveis de ambiente/secrets do
   provedor de hospedagem/deploy usado em produção. `MONGO_URI` nunca deve
   ser commitado no repositório nem hardcoded em código-fonte.

No startup, a aplicação valida que `MONGO_URI` está definida e que começa
com `mongodb://` ou `mongodb+srv://`; caso contrário, o processo falha
antes de o servidor HTTP começar a aceitar requisições, com uma mensagem
que referencia apenas o nome da variável (`MONGO_URI`), nunca o valor
configurado.

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

Comportamento padrão de segurança:

- `NODE_ENV=production`: Swagger desabilitado por padrão.
- Demais ambientes: Swagger habilitado por padrão.
- Para forçar comportamento: use `ENABLE_SWAGGER=true` ou `ENABLE_SWAGGER=false`.

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
- `POST /auth/login` possui um rate limit dedicado (mais restritivo que o
  limite global da aplicação), retornando `429` ao exceder o limite de
  tentativas na janela configurada.
- `trust proxy` do Express é configurado explicitamente via a variável
  `TRUST_PROXY_HOPS`. O padrão seguro é `0` (nenhum proxy confiável); deploys
  atrás de proxies reversos devem definir explicitamente a quantidade de
  hops conforme a topologia validada.
- Em `NODE_ENV=production`, o startup valida configurações sensíveis e
  falha imediatamente (sem subir o servidor HTTP) quando alguma delas é
  fraca ou inválida:
  - `JWT_SECRET` precisa ter no mínimo 32 caracteres.
  - `ADMIN_PASSWORD` precisa ter no mínimo 12 caracteres, com letra
    maiúscula, letra minúscula, dígito e símbolo, e não pode ser um valor
    fraco/padrão conhecido (ex.: `123456`, `password`, `admin`,
    `changeme`).
  - `CORS_ORIGIN` é obrigatória e cada origem precisa ser uma URL
    `https://` absoluta e explícita (sem curinga `*`, sem `http://`).
  - Em todos os ambientes, `JWT_EXPIRES_IN` (máx. 1h) e
    `JWT_REFRESH_EXPIRES_IN` (máx. 30d) precisam ser durações válidas
    dentro desses limites.
  - As mensagens de erro de validação referenciam apenas o nome da
    variável, nunca o valor configurado.

## Testes

```bash
npm test
npm run test:coverage
npm run test:e2e
```

O comando `npm run test:coverage` gera a cobertura dos testes unitários no diretório `coverage/`, incluindo o arquivo `coverage/lcov.info`, usado pela análise do Sonar.
