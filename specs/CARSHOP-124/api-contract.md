# Contrato de API — carshop-backend (CARSHOP-124)

## Status

Ready — documento de consolidação do contrato HTTP atualmente implementado
no `carshop-backend`, para consumo do time de frontend (Next.js).

## Sobre este documento

- Esta é uma tarefa de **documentação**. Nenhum comportamento do backend foi
  alterado. Todo o conteúdo abaixo foi derivado do Swagger existente
  (`src/infra/docs/*.swagger.ts`), das rotas reais
  (`src/infra/http/routes/*.routes.ts`) e dos controllers/validators
  correspondentes.
- Nenhum valor real de credencial, segredo, cookie ou token aparece neste
  documento. Todos os exemplos usam placeholders fictícios (ex.:
  `admin@example.com`, `<ACCESS_TOKEN>`).
- **Referência operacional do contrato**: enquanto este documento existir, ele
  deve ser tratado como um resumo de consolidação. A especificação OpenAPI é
  mantida manualmente em `src/infra/docs/*.swagger.ts` e disponibilizada em:
  - `GET /docs` — Swagger UI interativo;
  - `GET /docs.json` — spec OpenAPI em JSON, consumível por geradores de
    client HTTP.

  Como essa especificação não é gerada automaticamente a partir das rotas ou
  dos validators, ela pode divergir do comportamento executado pelo backend e
  deve ser conferida com a implementação quando houver dúvida.

  A disponibilidade de `/docs` e `/docs.json` depende das variáveis de
  ambiente `ENABLE_SWAGGER` e `NODE_ENV` (por padrão, habilitado fora de
  produção e desabilitado em produção, salvo override explícito de
  `ENABLE_SWAGGER`). **Não é garantido** que esses endpoints estejam
  habilitados no ambiente de produção atual do Render — isso não pôde ser
  confirmado nesta tarefa e deve ser tratado como condicional pelo time de
  frontend.

## Base URL

- **Produção (Render)**: `https://carshop-backend-htag.onrender.com`
  (valor público do endpoint HTTP exposto; não é um segredo).
- **Desenvolvimento local**: `http://localhost:{PORT}` (`PORT` configurável
  via variável de ambiente do backend; ver `.env.example` do backend).

### Sugestão não vinculante — variável de ambiente do frontend

Sugere-se, **a validar com o time**, que o frontend Next.js centralize a
Base URL do backend em uma variável de ambiente pública, por exemplo:

```env
NEXT_PUBLIC_API_URL=https://carshop-backend-htag.onrender.com
```

Isso é apenas um exemplo ilustrativo — o nome da variável e o valor final
não são uma decisão fechada por esta tarefa.

---

## Alertas operacionais importantes

### 1. Cookies cross-origin (`refresh_token` / `csrf_token`)

O fluxo de autenticação depende de dois cookies emitidos por
`POST /auth/login` (ver seção "Autenticação"):

- `refresh_token`: `HttpOnly`, `SameSite=Strict`, `path=/auth`.
- `csrf_token`: legível por JavaScript, `SameSite=Strict`, `path=/auth`.

**Limitação conhecida**: como `refresh_token` é `SameSite=Strict`, o
navegador **não envia esse cookie em requisições cross-site**, mesmo que o
frontend use `fetch(..., { credentials: 'include' })`. Isso ocorre sempre
que o frontend Next.js está hospedado em um domínio diferente do domínio do
backend (por exemplo, o frontend em um domínio da Vercel e o backend em
`onrender.com`).

Na prática, isso pode causar **falha silenciosa** em `POST /auth/refresh` e
`POST /auth/logout` quando essas rotas são chamadas a partir de um domínio
diferente do backend: o cookie `refresh_token` simplesmente não chega na
requisição, mesmo que a chamada pareça correta do lado do cliente.

Esta é uma limitação atual e conhecida da arquitetura de cookies, tratada
por uma tarefa dedicada, **CARSHOP-126**, que está aberta para avaliação
arquitetural do atributo `SameSite`. Este documento **não propõe nenhum
workaround client-side** para contornar essa limitação (como enviar o
refresh token manualmente em um header, relaxar `SameSite`, ou desabilitar
`HttpOnly`), pois qualquer solução desse tipo enfraqueceria a proteção
CSRF/cookie do backend. O time de frontend deve tratar essa limitação como
conhecida e aguardar a resolução de CARSHOP-126, e não implementar uma
solução paliativa própria.

### 2. `CORS_ORIGIN` pendente (CARSHOP-125)

Chamadas feitas diretamente do navegador (via `fetch`/`XMLHttpRequest`) só
funcionam se a variável de ambiente `CORS_ORIGIN` do backend estiver
configurada para incluir a origem exata do frontend. Essa configuração
ainda está **pendente** em uma tarefa separada, **CARSHOP-125**. Até que
essa tarefa seja resolvida, chamadas do navegador a partir da origem do
frontend podem ser bloqueadas pela política de CORS do backend. Esta tarefa
apenas documenta essa dependência — não a resolve.

### 3. Cold start (free tier do Render)

O backend está hospedado no free tier do Render, que hiberna a instância
após um período de inatividade. A primeira requisição após um período de
inatividade (incluindo chamadas a `GET /health`) pode levar
significativamente mais tempo para responder enquanto a instância é
reativada ("cold start"). O time de frontend deve considerar esse
comportamento ao desenhar sua estratégia de retry/loading/timeout,
especialmente em fluxos que dependem de `GET /health` para verificar
disponibilidade do backend.

### 4. Rate limit global

Todas as rotas documentadas passam por um limitador global de **100
requisições por IP a cada 15 minutos**, incluindo respostas de sucesso e de
erro. Isso inclui `/`, `/health` e, quando habilitados, `/docs` e `/docs.json`.
Ao exceder o limite, qualquer endpoint pode responder `429` com o corpo:

```json
{ "message": "Muitas requisições. Tente novamente em alguns minutos." }
```

As respostas também expõem os headers padrão de rate limit para indicar o
limite, o saldo restante e o momento de reset. `POST /auth/login` passa ainda
por um limitador dedicado mais restritivo: 5 tentativas por combinação de IP e
hash do e-mail a cada 5 minutos.

---

## Autenticação

Modelo: JWT de access token de curta duração + refresh token rotativo,
com sessão rastreada no servidor e revogação explícita no logout. Proteção
CSRF via padrão double-submit cookie.

### Cookies

| Cookie | `HttpOnly` | Acessível por JS | `SameSite` | `path` | Uso |
| --- | --- | --- | --- | --- | --- |
| `refresh_token` | Sim | Não | `Strict` | `/auth` | Usado internamente pelo backend para renovar a sessão em `POST /auth/refresh`. Nunca deve ser lido ou manipulado pelo frontend. |
| `csrf_token` | Não | Sim | `Strict` | `/auth` | Deve ser lido pelo frontend e reenviado no header `X-CSRF-Token` em `POST /auth/refresh` e `POST /auth/logout` (padrão double-submit cookie). |

Nenhum valor real de cookie é reproduzido neste documento.

### `POST /auth/login`

Autentica o administrador e cria uma sessão.

- **Autenticação exigida**: nenhuma (rota pública, mas com rate limit
  dedicado).
- **CSRF**: não aplicável (ainda não existe sessão).
- **Rate limit**: limitador dedicado, mais restritivo que o global,
  aplicado por combinação de IP + hash do e-mail informado.

Corpo da requisição (`application/json`):

```json
{
  "email": "admin@example.com",
  "password": "<SENHA_DO_ADMIN>"
}
```

Resposta de sucesso `200`:

```json
{
  "accessToken": "<ACCESS_TOKEN>",
  "sessionId": "<SESSION_UUID>",
  "tokenType": "Bearer"
}
```

Também define, via `Set-Cookie`, os cookies `refresh_token` e `csrf_token`
descritos acima.

Erros:

| Status | Quando ocorre |
| --- | --- |
| `400` | Corpo inválido (schema de `email`/`password`). |
| `401` | Credenciais inválidas. |
| `429` | Limite global ou limite dedicado de login excedido. |

### `POST /auth/refresh`

Rotaciona access token, refresh token e csrf token (rotação de sessão).

- **Autenticação exigida**: cookies `refresh_token` e `csrf_token` válidos
  (não usa Bearer token).
- **CSRF**: obrigatório. Requer o header `X-CSRF-Token` com o mesmo valor
  do cookie `csrf_token` (double-submit cookie).
- Ver alerta sobre limitação cross-origin na seção "Alertas operacionais".

Resposta de sucesso `200`: mesmo formato de `AuthResponse` do login
(`accessToken`, `sessionId`, `tokenType`). Novos `refresh_token` e
`csrf_token` são emitidos via `Set-Cookie`.

Erros:

| Status | Quando ocorre |
| --- | --- |
| `401` | Refresh token ausente, inválido, expirado ou sessão revogada. |
| `403` | Falha na validação CSRF (`X-CSRF-Token` ausente ou divergente do cookie). |
| `429` | Limite global de requisições excedido. |

### `POST /auth/logout`

Revoga a sessão atual e remove os cookies de autenticação.

- **Autenticação exigida**: cookies `refresh_token` e `csrf_token` válidos.
- **CSRF**: obrigatório, mesmo padrão de `POST /auth/refresh`.
- Ver alerta sobre limitação cross-origin na seção "Alertas operacionais".

Resposta de sucesso `200`:

```json
{ "success": true }
```

Erros:

| Status | Quando ocorre |
| --- | --- |
| `401` | Sessão inválida. |
| `403` | Falha na validação CSRF. |
| `429` | Limite global de requisições excedido. |

### `GET /auth/session`

Retorna dados da sessão autenticada atual.

- **Autenticação exigida**: `Authorization: Bearer <ACCESS_TOKEN>`.
- **CSRF**: não aplicável (não depende de cookies).

Resposta de sucesso `200`:

```json
{
  "sessionId": "<SESSION_UUID>",
  "email": "admin@example.com",
  "expiresAt": "2026-03-30T12:00:00.000Z"
}
```

Erros:

| Status | Quando ocorre |
| --- | --- |
| `401` | Token ausente, inválido ou sessão expirada. |
| `429` | Limite global de requisições excedido. |

---

## Works (`/works`)

### `WorkResponse` (schema completo)

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
  "status": "draft | published",
  "createdAt": "2026-01-01T00:00:00.000Z",
  "updatedAt": "2026-01-01T00:00:00.000Z",
  "deletedAt": "2026-01-01T00:00:00.000Z | null"
}
```

### `GET /works`

Lista trabalhos do portfólio.

- **Autenticação exigida**: nenhuma por padrão. Quando o parâmetro de
  query `includeDrafts=true` é informado, exige
  `Authorization: Bearer <ACCESS_TOKEN>` válido vinculado a uma sessão
  ativa; sem esse token, a resposta é `401`.
- **Parâmetros de query**:
  - `includeDrafts` (boolean, opcional, padrão `false`): quando `true`,
    inclui também trabalhos em rascunho na resposta (requer autenticação).

Resposta de sucesso `200`: array de `WorkResponse`.

Erros:

| Status | Quando ocorre |
| --- | --- |
| `401` | `includeDrafts=true` informado sem access token válido. |
| `429` | Limite global de requisições excedido. |

### `GET /works/{slug}`

Busca um trabalho publicado pelo slug.

- **Autenticação exigida**: nenhuma (rota pública).
- **Parâmetros de path**: `slug` (string).
- Retorna um único trabalho apenas quando o `status` é `published` e
  `deletedAt` é nulo; caso contrário, `404` — inclusive para trabalhos em
  rascunho ou removidos logicamente.

Resposta de sucesso `200`: `WorkResponse`.

Erros:

| Status | Quando ocorre |
| --- | --- |
| `404` | Nenhum trabalho publicado e não removido encontrado para o slug. |
| `429` | Limite global de requisições excedido. |

### `POST /works`

Cria um novo trabalho.

- **Autenticação exigida**: `Authorization: Bearer <ACCESS_TOKEN>`.

Corpo da requisição (`application/json`):

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

`slug`, `title`, `description` e `category` são obrigatórios. `tags`
(padrão `[]`) e `status` (padrão `"draft"`, enum `draft`/`published`) são
opcionais.

Resposta de sucesso `201`: `WorkResponse`.

Erros:

| Status | Quando ocorre |
| --- | --- |
| `400` | Payload inválido. |
| `401` | Access token ausente, inválido ou sessão expirada. |
| `409` | Já existe um trabalho com o slug informado. |
| `429` | Limite global de requisições excedido. |

---

## Comentários públicos (`/works/{workId}/comments`)

### `CommentResponse` (schema)

```json
{
  "id": "string",
  "workId": "string",
  "authorName": "string",
  "content": "string",
  "status": "PENDING | APPROVED",
  "createdAt": "2026-01-01T00:00:00.000Z",
  "updatedAt": "2026-01-01T00:00:00.000Z"
}
```

### `GET /works/{workId}/comments`

Lista apenas comentários já aprovados (`status = APPROVED`) de um trabalho.

- **Autenticação exigida**: nenhuma (rota pública).
- **Parâmetros de path**: `workId` (string).

Resposta de sucesso `200`: array de `CommentResponse`.

Erros:

| Status | Quando ocorre |
| --- | --- |
| `404` | Trabalho não encontrado. |
| `429` | Limite global de requisições excedido. |

### `POST /works/{workId}/comments`

Cria um comentário público. Todo comentário recém-criado é atribuído com o
status inicial `PENDING` e só passa a aparecer publicamente após aprovação
administrativa (ver `PATCH /admin/comments/{commentId}/approve`).

- **Autenticação exigida**: nenhuma (rota pública).
- **Parâmetros de path**: `workId` (string).

Corpo da requisição (`application/json`):

```json
{
  "authorName": "Visitante",
  "content": "Ficou muito bom esse trabalho."
}
```

Validação (refletida do validator real do backend, ainda que não estivesse
completamente refletida no fragmento Swagger anterior — corrigido nesta
tarefa; ver nota de divergência no resumo de entrega):

- `authorName`: string, 2 a 80 caracteres.
- `content`: string, 3 a 1000 caracteres.

Resposta de sucesso `201`: `CommentResponse` com `status: "PENDING"`.

Erros:

| Status | Quando ocorre |
| --- | --- |
| `400` | Payload inválido. |
| `404` | Trabalho não encontrado. |
| `429` | Limite global de requisições excedido. |

---

## Comentários administrativos (`/admin/comments`)

Todos os endpoints abaixo exigem
`Authorization: Bearer <ACCESS_TOKEN>` válido vinculado a uma sessão ativa.

### `PATCH /admin/comments/{commentId}/approve`

Aprova um comentário pendente, alterando seu `status` para `APPROVED` e
permitindo sua exibição pública.

- **Parâmetros de path**: `commentId` (string, uuid).

Resposta de sucesso `200`: `CommentResponse` atualizado.

Erros:

| Status | Quando ocorre |
| --- | --- |
| `401` | Token ausente, inválido ou sessão expirada. |
| `404` | Comentário não encontrado. |
| `429` | Limite global de requisições excedido. |

### `PATCH /admin/comments/{commentId}`

Edita parcialmente um comentário (autor, conteúdo e/ou status).

- **Parâmetros de path**: `commentId` (string, uuid).

Corpo da requisição (`application/json`, ao menos uma propriedade):

```json
{
  "authorName": "Visitante",
  "content": "Comentário revisado pelo administrador.",
  "status": "APPROVED"
}
```

Validação: `authorName` (2–80 caracteres), `content` (3–1000 caracteres),
`status` (`PENDING` ou `APPROVED`) — todos opcionais, mas ao menos um deve
estar presente.

Resposta de sucesso `200`: `CommentResponse` atualizado.

Erros:

| Status | Quando ocorre |
| --- | --- |
| `400` | Payload inválido. |
| `401` | Token ausente, inválido ou sessão expirada. |
| `404` | Comentário não encontrado. |
| `429` | Limite global de requisições excedido. |

### `DELETE /admin/comments/{commentId}`

Remove definitivamente um comentário.

- **Parâmetros de path**: `commentId` (string, uuid).

Resposta de sucesso `200`:

```json
{ "success": true }
```

Erros:

| Status | Quando ocorre |
| --- | --- |
| `401` | Token ausente, inválido ou sessão expirada. |
| `404` | Comentário não encontrado. |
| `429` | Limite global de requisições excedido. |

---

## Works/imagens administrativos (`/admin/works`)

Todos os endpoints abaixo exigem
`Authorization: Bearer <ACCESS_TOKEN>` válido vinculado a uma sessão ativa.

### `POST /admin/works/{workId}/images`

Adiciona uma imagem a um trabalho. Envia o arquivo para o storage externo
(Cloudinary) e persiste no MongoDB apenas a URL e os metadados.

- **Parâmetros de path**: `workId` (string, uuid).
- **Corpo da requisição**: `multipart/form-data`.

Campos do form-data:

| Campo | Obrigatório | Descrição |
| --- | --- | --- |
| `file` | Sim | Arquivo de imagem. Apenas um por requisição. Formatos aceitos: JPEG, PNG, WebP. Tamanho máximo: 5 MB. O conteúdo binário real do arquivo é inspecionado (não apenas o `Content-Type` declarado); um arquivo cujo conteúdo detectado não seja um JPEG/PNG/WebP válido, ou que divirja do tipo declarado, é rejeitado com `415`. |
| `alt` | Não | Texto alternativo para acessibilidade/SEO. Quando ausente, é tratado como string vazia. A persistência limita o valor a 160 caracteres, mas o validator HTTP atual não verifica esse tamanho antes do upload; veja a ressalva abaixo. |
| `isCover` | Não | Quando enviado como a string `"true"`, define esta imagem como capa do trabalho e remove a marcação de capa das demais imagens do mesmo trabalho. |

**Ressalva sobre `alt`**: um valor com mais de 160 caracteres passa pela
validação inicial e o arquivo é enviado ao storage antes de a persistência ser
tentada. O Mongoose rejeita os metadados, o backend tenta compensar removendo o
arquivo já enviado e responde `500`; não responde `400` nesse caso. Essa é uma
limitação atual da validação na fronteira HTTP.

Resposta de sucesso `201`:

```json
{ "message": "Imagem adicionada com sucesso." }
```

Erros:

| Status | Quando ocorre |
| --- | --- |
| `400` | Arquivo ausente, falha ao processar o multipart ou payload de campos inválido. Não se aplica a `alt` com mais de 160 caracteres. |
| `401` | Access token ausente, inválido ou sessão expirada. |
| `404` | Trabalho não encontrado. |
| `413` | Imagem ultrapassa o limite de 5 MB. |
| `415` | Tipo de arquivo não suportado (declarado ou detectado no conteúdo binário). |
| `429` | Limite global de requisições excedido. |
| `500` | Falha inesperada ao enviar ou persistir a imagem, incluindo `alt` com mais de 160 caracteres; se o upload externo já ocorreu, o backend tenta removê-lo como compensação. |

### `DELETE /admin/works/{workId}/images/{imageId}`

Remove uma imagem de um trabalho: remove o arquivo do storage externo
(usando o `publicId` persistido) e o metadado correspondente no MongoDB.

- **Parâmetros de path**: `workId` (string, uuid), `imageId` (string,
  uuid).

Resposta de sucesso `200`:

```json
{ "success": true }
```

Erros:

| Status | Quando ocorre |
| --- | --- |
| `401` | Access token ausente, inválido ou sessão expirada. |
| `404` | Trabalho ou imagem não encontrado(a). |
| `429` | Limite global de requisições excedido. |
| `500` | Falha inesperada ao remover a imagem. |

### `DELETE /admin/works/{workId}`

Remove definitivamente um trabalho, incluindo exclusão em cascata:

1. Remove todas as imagens do trabalho no storage externo (Cloudinary).
2. Remove o trabalho e seus comentários associados do MongoDB.

**Garantia importante**: se a remoção de qualquer arquivo no storage
externo falhar, a operação é **abortada antes de alterar o MongoDB**, para
evitar registros órfãos (trabalho/comentários removidos no banco mas
imagens ainda existentes ou parcialmente removidas no storage).

- **Parâmetros de path**: `workId` (string, uuid).

Resposta de sucesso `200`:

```json
{ "success": true }
```

Erros:

| Status | Quando ocorre |
| --- | --- |
| `401` | Access token ausente, inválido ou sessão expirada. |
| `404` | Trabalho não encontrado. |
| `429` | Limite global de requisições excedido. |
| `502` | Falha ao remover arquivos do storage externo (operação abortada antes de alterar o MongoDB). |

---

## Health check

### `GET /`

Health check simples, sem autenticação.

Resposta de sucesso `200` (`text/plain`): `Hello World!`

Erro possível: `429` quando o limite global de requisições é excedido.

### `GET /health`

Health check detalhado, usado pela plataforma de deploy (Render) para
liveness do processo e conectividade com o MongoDB. Sem autenticação.

Dois formatos possíveis de resposta:

Resposta `200` (serviço operacional e conectado ao banco):

```json
{ "status": "ok", "database": "connected" }
```

Resposta `503` (serviço degradado, sem conexão com o banco):

```json
{ "status": "degraded", "database": "disconnected" }
```

Erro possível: `429` quando o limite global de requisições é excedido.

Ver também o alerta sobre cold start do free tier do Render na seção
"Alertas operacionais".

---

## Referência rápida de endpoints

| Método | Path | Autenticação | CSRF |
| --- | --- | --- | --- |
| `GET` | `/` | Nenhuma | — |
| `GET` | `/health` | Nenhuma | — |
| `POST` | `/auth/login` | Nenhuma (rate limit dedicado) | — |
| `POST` | `/auth/refresh` | Cookies `refresh_token` + `csrf_token` | Sim (`X-CSRF-Token`) |
| `POST` | `/auth/logout` | Cookies `refresh_token` + `csrf_token` | Sim (`X-CSRF-Token`) |
| `GET` | `/auth/session` | Bearer token | — |
| `GET` | `/works` | Nenhuma (Bearer se `includeDrafts=true`) | — |
| `GET` | `/works/{slug}` | Nenhuma | — |
| `POST` | `/works` | Bearer token | — |
| `GET` | `/works/{workId}/comments` | Nenhuma | — |
| `POST` | `/works/{workId}/comments` | Nenhuma | — |
| `PATCH` | `/admin/comments/{commentId}/approve` | Bearer token | — |
| `PATCH` | `/admin/comments/{commentId}` | Bearer token | — |
| `DELETE` | `/admin/comments/{commentId}` | Bearer token | — |
| `POST` | `/admin/works/{workId}/images` | Bearer token | — |
| `DELETE` | `/admin/works/{workId}/images/{imageId}` | Bearer token | — |
| `DELETE` | `/admin/works/{workId}` | Bearer token | — |

## Traceability

- FR-001 → seção "Autenticação"
- FR-002 → seção "Autenticação" › "Cookies"
- FR-003 → seção "Works"
- FR-004 → seção "Comentários públicos"
- FR-005 → seção "Comentários administrativos"
- FR-006 → seção "Works/imagens administrativos"
- FR-007 → seção "Health check"
- FR-008 → seção "Sobre este documento"
- FR-009 → seção "Alertas operacionais" › item 1
- FR-010 → seção "Alertas operacionais" › item 2
- FR-011 → seção "Base URL" › "Sugestão não vinculante"
- FR-012 → seção "Alertas operacionais" › item 3
