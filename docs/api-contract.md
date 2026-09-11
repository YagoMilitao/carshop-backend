# Contrato HTTP da API — Carshop Backend

> **Este documento é mantido manualmente a partir do código-fonte.**
>
> Fonte de verdade: os fragments OpenAPI em `src/infra/docs/*.swagger.ts`
> (montados por `src/infra/swagger.ts`), cruzados com as rotas reais em
> `src/infra/http/routes/*.routes.ts`, `src/infra/config/routes.ts` e os
> controllers em `src/presentation/controllers/`.
>
> Sempre que o contrato mudar (rota, autenticação, CSRF, cookies, body,
> resposta, status ou rate limiting), este arquivo deve ser atualizado no
> mesmo conjunto de mudanças que atualiza o Swagger — mesma regra definida
> em `.claude/rules/openapi.md` para os fragments OpenAPI.
>
> `GET /docs` (Swagger UI) e `GET /docs.json` (documento OpenAPI) continuam
> sendo a fonte **interativa** do contrato quando `ENABLE_SWAGGER=true` (o
> padrão fora de `NODE_ENV=production`). Este arquivo existe para cobrir o
> cenário em que o Swagger está desabilitado (padrão em produção) e para
> servir como artefato versionado, revisável em PR, que não depende de
> nenhum serviço em runtime nem do Notion.
>
> Nenhum valor real de ambiente, segredo, token ou credencial aparece
> neste documento — apenas nomes de variáveis e valores de exemplo
> fictícios, seguindo a mesma política aplicada a `specs/`
> (`.claude/rules/spec-security.md`).

## Convenções gerais

- Todas as respostas de sucesso e erro usam `Content-Type: application/json`,
  exceto `GET /` (`text/plain`).
- Respostas de erro seguem o formato:

  ```json
  {
    "message": "Descrição do erro."
  }
  ```

  Erros originados de `HttpError` podem incluir também um campo opcional
  `details` (ver `src/infra/presentation/middleware/error-handler.middleware.ts`).
  JSON inválido no corpo da requisição retorna `400` com
  `{ "message": "JSON inválido no corpo da requisição." }`, e corpo acima do
  limite (`1mb`) retorna `413` com
  `{ "message": "Corpo da requisição excede o limite permitido." }`.

- **Rate limit global**: todas as rotas (exceto onde indicado um limite
  dedicado) estão sujeitas ao rate limit global —
  **100 requisições por IP a cada 15 minutos**. Ao exceder, a resposta é
  `429` com `{ "message": "Muitas requisições. Tente novamente em alguns minutos." }`.
  Headers padrão de rate limit (`RateLimit-*`) são incluídos na resposta.

- **Autenticação**: rotas privadas exigem um access token JWT no header:

  ```http
  Authorization: Bearer <ACCESS_TOKEN>
  ```

  O token é validado quanto a tipo, assinatura, expiração e vínculo com uma
  sessão ativa (`src/infra/presentation/middleware/auth.middleware.ts`).

- **CSRF (double-submit cookie)**: aplicável apenas a `POST /auth/refresh`
  e `POST /auth/logout`. Exige o cookie `csrf_token` e o header
  `X-CSRF-Token` com o mesmo valor.

- **Cookies de autenticação** (definidos por `POST /auth/login` e
  rotacionados por `POST /auth/refresh`; removidos por `POST /auth/logout`):
  - `refresh_token`: `HttpOnly`, `Secure`, `SameSite=None`, `Path=/auth`.
  - `csrf_token`: **não** `HttpOnly`, `Secure`, `SameSite=None`, `Path=/auth`.
  - `Secure` e `SameSite=None` são aplicados sempre (independentemente de
    `NODE_ENV`), para suportar um frontend hospedado em origem diferente
    da API.
  - `maxAge` de ambos os cookies segue `JWT_REFRESH_COOKIE_MAX_AGE_MS`
    (padrão: 7 dias, se a variável não estiver definida, for vazia, não
    resolver para um número válido, ou resolver para um valor numérico
    não positivo, isto é, zero ou negativo).

- **CORS**: origens permitidas vêm de `CORS_ORIGIN` (`cors.origin`),
  `credentials: true`, métodos permitidos `GET, POST, PATCH, DELETE`,
  headers permitidos `Content-Type, Authorization, X-CSRF-Token`.

---

## Health

### `GET /`

- Autenticação: nenhuma.
- Resposta `200` (`text/plain`): `Hello World!`
- `429`: rate limit global.

### `GET /health`

- Autenticação: nenhuma.
- Usado pela plataforma de deploy (Render) para liveness e conectividade
  com o MongoDB.
- Resposta `200` (`application/json`):

  ```json
  { "status": "ok", "database": "connected" }
  ```

- Resposta `503` (serviço degradado, sem conexão com o banco):

  ```json
  { "status": "degraded", "database": "disconnected" }
  ```

- `429`: rate limit global.

---

## Auth

Rotas montadas em `/auth` (`src/infra/http/routes/auth.routes.ts`).

### `POST /auth/login`

- Autenticação: nenhuma (ainda não existe sessão).
- Rate limit: **dedicado**, mais restritivo que o global —
  **5 tentativas por chave (IP + hash SHA-256 do e-mail normalizado) a
  cada 5 minutos**. Conta tentativas com sucesso e falha. Ao exceder,
  `429` com `{ "message": "Muitas tentativas de login. Tente novamente mais tarde." }`.
  Além disso, continua sujeita ao rate limit global.
- Body (`application/json`), obrigatório:

  ```json
  {
    "email": "admin@example.com",
    "password": "<ADMIN_PASSWORD>"
  }
  ```

- Resposta `200`:

  ```json
  {
    "accessToken": "<ACCESS_TOKEN>",
    "csrfToken": "<CSRF_TOKEN>",
    "sessionId": "<uuid>",
    "tokenType": "Bearer"
  }
  ```

  Além do corpo, define os cookies `refresh_token` e `csrf_token`
  (ver seção "Cookies de autenticação" acima). O `csrfToken` também é
  retornado no corpo porque JavaScript em outra origem não consegue ler o
  cookie definido para o domínio da API.

- Erros:
  - `400`: body inválido.
  - `401`: credenciais inválidas.
  - `429`: limite global ou limite dedicado de login excedido.

### `POST /auth/refresh`

- Autenticação: cookie `refresh_token` + validação CSRF
  (`csrfProtectionMiddleware`).
- Header obrigatório: `X-CSRF-Token: <valor do cookie csrf_token>`.
- Cookies obrigatórios: `refresh_token`, `csrf_token`.
- Sem body.
- Resposta `200`: mesmo shape de `AuthResponse` de `/auth/login`
  (`accessToken`, `csrfToken`, `sessionId`, `tokenType`). Rotaciona e
  redefine `refresh_token` e `csrf_token`, invalidando os valores
  anteriores.
- Erros:
  - `401`: refresh token inválido.
  - `403`: falha na validação CSRF (header ausente ou não confere com o
    cookie).
  - `429`: rate limit global.

### `POST /auth/logout`

- Autenticação: cookie `refresh_token` + validação CSRF
  (`csrfProtectionMiddleware`).
- Header obrigatório: `X-CSRF-Token: <valor do cookie csrf_token>`.
- Sem body.
- Resposta `200`:

  ```json
  { "success": true }
  ```

  Revoga a sessão no servidor e remove os cookies `refresh_token` e
  `csrf_token`.
- Erros:
  - `401`: sessão inválida.
  - `403`: falha na validação CSRF.
  - `429`: rate limit global.

### `GET /auth/session`

- Autenticação: `Authorization: Bearer <ACCESS_TOKEN>` (obrigatório).
- Resposta `200`:

  ```json
  {
    "sessionId": "<uuid>",
    "email": "admin@example.com",
    "expiresAt": "2026-03-30T12:00:00.000Z"
  }
  ```

- Erros:
  - `401`: token inválido ou sessão expirada.
  - `429`: rate limit global.

---

## Works

Rotas montadas em `/works` (`src/infra/http/routes/work.routes.ts`).

### `GET /works`

- Autenticação: **condicional**. Sem `includeDrafts=true`, é pública. Com
  `includeDrafts=true`, exige `Authorization: Bearer <ACCESS_TOKEN>` válido
  (`requireAuthForDraftsMiddleware`); caso contrário responde `401`.
- Query params:
  - `includeDrafts` (boolean, opcional, padrão `false`): quando `true`,
    inclui trabalhos em rascunho (status `draft`) na resposta, além dos
    publicados.
- Resposta `200`: array de `WorkResponse` (ver schema abaixo).
- Erros:
  - `401`: access token ausente/inválido/sessão expirada ao solicitar
    `includeDrafts=true`.
  - `429`: rate limit global.

### `POST /works`

- Autenticação: `Authorization: Bearer <ACCESS_TOKEN>` (obrigatório).
- Body (`application/json`), obrigatório:

  ```json
  {
    "slug": "honda-civic-2020",
    "title": "Honda Civic 2020",
    "description": "Restauração completa do banco em couro.",
    "category": "bancos",
    "tags": ["couro", "restauração"],
    "status": "draft"
  }
  ```

  - `slug`, `title`, `description`, `category`: obrigatórios (`string`).
  - `tags`: `string[]`, padrão `[]`.
  - `status`: `"draft" | "published"`, padrão `"draft"`.
- Resposta `201`: `WorkResponse` (ver abaixo).
- Erros:
  - `400`: payload inválido.
  - `401`: access token ausente/inválido/sessão expirada.
  - `409`: já existe um trabalho com o `slug` informado.
  - `429`: rate limit global.

### `GET /works/{slug}`

- Autenticação: nenhuma (pública).
- Path param: `slug` (string).
- Retorna um único trabalho apenas quando `status = published` e
  `deletedAt` é nulo; caso contrário (inclusive rascunhos ou removidos
  logicamente), responde `404`.
- Resposta `200`: `WorkResponse`.
- Erros:
  - `404`: nenhum trabalho publicado e não removido encontrado para o
    `slug`.
  - `429`: rate limit global.

### `WorkResponse` (schema)

```json
{
  "id": "string",
  "slug": "string",
  "title": "string",
  "description": "string",
  "category": "string",
  "tags": ["string"],
  "images": [
    {
      "id": "string",
      "url": "string",
      "publicId": "string",
      "alt": "string",
      "isCover": true,
      "order": 0,
      "createdAt": "2026-01-01T00:00:00.000Z",
      "updatedAt": "2026-01-01T00:00:00.000Z"
    }
  ],
  "status": "draft",
  "createdAt": "2026-01-01T00:00:00.000Z",
  "updatedAt": "2026-01-01T00:00:00.000Z",
  "deletedAt": null
}
```

---

## Comments (público)

Rotas montadas em `/works/:workId/comments`
(`src/infra/http/routes/work.routes.ts`).

### `GET /works/{workId}/comments`

- Autenticação: nenhuma (pública).
- Path param: `workId` (string).
- Retorna apenas comentários com `status = APPROVED`.
- Resposta `200`: array de `CommentResponse` (ver abaixo).
- Erros:
  - `404`: trabalho não encontrado.
  - `429`: rate limit global.

### `POST /works/{workId}/comments`

- Autenticação: nenhuma (pública).
- Path param: `workId` (string).
- Body (`application/json`), obrigatório:

  ```json
  {
    "authorName": "Yago",
    "content": "Ficou muito bom esse trabalho."
  }
  ```

  - `authorName`: string, 2–80 caracteres.
  - `content`: string, 3–1000 caracteres.
- Cria comentário com `status = PENDING` (exige aprovação administrativa
  antes de aparecer em `GET /works/{workId}/comments`).
- Resposta `201`: `CommentResponse`.
- Erros:
  - `400`: payload inválido.
  - `404`: trabalho não encontrado.
  - `429`: rate limit global.

### `CommentResponse` (schema)

```json
{
  "id": "string",
  "workId": "string",
  "authorName": "string",
  "content": "string",
  "status": "PENDING",
  "createdAt": "2026-01-01T00:00:00.000Z",
  "updatedAt": "2026-01-01T00:00:00.000Z"
}
```

`status` é `"PENDING" | "APPROVED"`.

---

## Admin — Works

Rotas montadas em `/admin/works`
(`src/infra/http/routes/admin-work.routes.ts` e
`src/infra/http/routes/work-image.routes.ts`, ambas registradas sob o
mesmo prefixo `/admin/works`).

### `DELETE /admin/works/{workId}`

- Autenticação: `Authorization: Bearer <ACCESS_TOKEN>` (obrigatório).
- Path param: `workId` (string, formato `uuid` no exemplo do Swagger).
- Remove definitivamente o trabalho: apaga todas as imagens no storage
  externo (Cloudinary), depois remove o trabalho e seus comentários no
  MongoDB. Se a remoção de qualquer arquivo no storage externo falhar, a
  operação é abortada **antes** de alterar o MongoDB.
- Falha parcial: se a remoção de uma imagem falhar depois que outra(s)
  imagem(ns) já tiverem sido removidas com sucesso do storage externo, o
  trabalho permanece no MongoDB referenciando as imagens já removidas —
  não há compensação/restauração automática das imagens já excluídas do
  storage externo. É seguro repetir a mesma chamada `DELETE` para o mesmo
  `workId`, pois o storage externo trata "não encontrado" como sucesso e as
  imagens já removidas não causam erro na nova tentativa. A operação só é
  concluída quando a remoção de todas as imagens restantes no storage
  externo tiver sucesso.
- Resposta `200`:

  ```json
  { "success": true }
  ```

- Erros:
  - `401`: access token ausente/inválido/sessão expirada.
  - `404`: trabalho não encontrado.
  - `429`: rate limit global.
  - `502`: falha ao remover arquivos do armazenamento externo. Se nenhuma
    imagem tiver sido removida, retorna a mensagem genérica. Se a falha for
    parcial, o corpo torna os efeitos já produzidos explícitos:

    ```json
    {
      "message": "Falha parcial ao remover arquivos do armazenamento externo. Algumas imagens já foram removidas. Tente novamente para concluir a operação.",
      "details": {
        "code": "PARTIAL_IMAGE_DELETION",
        "retryable": true,
        "removedImagesCount": 1,
        "remainingImagesCount": 1
      }
    }
    ```

### `POST /admin/works/{workId}/images`

- Autenticação: `Authorization: Bearer <ACCESS_TOKEN>` (obrigatório).
- Path param: `workId` (string, formato `uuid` no exemplo do Swagger).
- Body: `multipart/form-data`, obrigatório:
  - `file` (binário, obrigatório): JPEG, PNG ou WebP, máximo 5 MB. O nome
    do campo precisa ser exatamente `file`
    (`uploadMiddleware.single('file')`). O conteúdo binário real é
    inspecionado (não apenas o `Content-Type` declarado); divergência ou
    tipo não suportado é rejeitado com `415`.
  - `alt` (string, opcional, máx. 160 caracteres): texto alternativo para
    acessibilidade/SEO. Quando ausente, tratado como string vazia. O
    limite de 160 caracteres é validado na camada HTTP (Zod), antes do
    upload: um `alt` com mais de 160 caracteres é rejeitado com `400` sem
    enviar o arquivo ao storage externo.
  - `isCover` (boolean, opcional, padrão `false`): quando `true`, define a
    imagem como capa do trabalho e remove a marcação de capa das demais
    imagens do mesmo trabalho.
- Resposta `201`:

  ```json
  { "message": "Imagem adicionada com sucesso." }
  ```

- Erros:
  - `400`: arquivo ausente, falha ao processar o multipart, payload de
    campos inválido ou `alt` com mais de 160 caracteres.
  - `401`: access token ausente/inválido/sessão expirada.
  - `404`: trabalho não encontrado.
  - `413`: imagem acima de 5 MB.
  - `415`: tipo de arquivo não suportado.
  - `429`: rate limit global.
  - `500`: falha inesperada ao enviar ou persistir a imagem.

### `DELETE /admin/works/{workId}/images/{imageId}`

- Autenticação: `Authorization: Bearer <ACCESS_TOKEN>` (obrigatório).
- Path params: `workId`, `imageId` (string, formato `uuid` no exemplo do
  Swagger).
- Remove o arquivo no storage externo (usando o `publicId` persistido) e o
  metadado correspondente no MongoDB.
- Resposta `200`:

  ```json
  { "success": true }
  ```

- Erros:
  - `401`: access token ausente/inválido/sessão expirada.
  - `404`: trabalho ou imagem não encontrado(a).
  - `429`: rate limit global.
  - `500`: falha inesperada ao remover a imagem.

---

## Admin — Comments

Rotas montadas em `/admin/comments`
(`src/infra/http/routes/admin-comment.routes.ts`). Todas exigem
autenticação (`router.use(authMiddleware)` aplicado a todas as rotas do
router).

### `PATCH /admin/comments/{commentId}/approve`

- Autenticação: `Authorization: Bearer <ACCESS_TOKEN>` (obrigatório).
- Path param: `commentId` (string, formato `uuid` no exemplo do Swagger).
- Sem body. Altera o `status` do comentário para `APPROVED`.
- Resposta `200`: `CommentResponse`.
- Erros:
  - `401`: token ausente/inválido/sessão expirada.
  - `404`: comentário não encontrado.
  - `429`: rate limit global.

### `PATCH /admin/comments/{commentId}`

- Autenticação: `Authorization: Bearer <ACCESS_TOKEN>` (obrigatório).
- Path param: `commentId` (string, formato `uuid` no exemplo do Swagger).
- Body (`application/json`), obrigatório, com **ao menos uma** propriedade
  (`minProperties: 1`):

  ```json
  {
    "authorName": "Visitante",
    "content": "Comentário revisado pelo administrador.",
    "status": "APPROVED"
  }
  ```

  - `authorName`: string, 2–80 caracteres (opcional).
  - `content`: string, 3–1000 caracteres (opcional).
  - `status`: `"PENDING" | "APPROVED"` (opcional).
- Edita parcialmente autor, conteúdo ou status do comentário.
- Resposta `200`: `CommentResponse`.
- Erros:
  - `400`: payload inválido.
  - `401`: token ausente/inválido/sessão expirada.
  - `404`: comentário não encontrado.
  - `429`: rate limit global.

### `DELETE /admin/comments/{commentId}`

- Autenticação: `Authorization: Bearer <ACCESS_TOKEN>` (obrigatório).
- Path param: `commentId` (string, formato `uuid` no exemplo do Swagger).
- Apaga definitivamente o comentário.
- Resposta `200`:

  ```json
  { "success": true }
  ```

- Erros:
  - `401`: token ausente/inválido/sessão expirada.
  - `404`: comentário não encontrado.
  - `429`: rate limit global.

---

## Referência cruzada

| Rota | Router | Controller |
| --- | --- | --- |
| `GET /`, `GET /health` | `src/infra/config/routes.ts` | `HealthController` |
| `/auth/*` | `src/infra/http/routes/auth.routes.ts` | `AuthController` |
| `GET/POST /works`, `GET /works/{slug}`, `/works/{workId}/comments` | `src/infra/http/routes/work.routes.ts` | `WorkController`, `CommentController` |
| `DELETE /admin/works/{workId}` | `src/infra/http/routes/admin-work.routes.ts` | `AdminWorkController` |
| `/admin/works/{workId}/images*` | `src/infra/http/routes/work-image.routes.ts` | `WorkImageController` |
| `/admin/comments/*` | `src/infra/http/routes/admin-comment.routes.ts` | `AdminCommentController` |
