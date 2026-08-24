# Specs Security Rules
`specs/` pode conter decisões e requisitos.
Nunca pode conter credenciais, secrets ou valores reais de ambiente.

Tudo dentro de `specs/` será considerado potencialmente público e versionado no Git.

Portanto, nunca escreva em `specs/`:

- senhas;
- tokens;
- API keys;
- secrets JWT;
- cookies;
- session IDs;
- credenciais de banco de dados;
- connection strings;
- valores reais de `.env`;
- conteúdo real de `.env`;
- chaves privadas;
- certificados privados;
- credentials JSON;
- service accounts;
- access tokens;
- refresh tokens;
- OAuth client secrets;
- webhook secrets;
- dados pessoais de usuários;
- emails privados quando não forem necessários;
- IPs internos;
- hostnames internos;
- URLs privadas de serviços;
- URLs assinadas;
- tokens presentes em URLs;
- dados reais de produção;
- dumps de banco;
- stack traces contendo dados sensíveis;
- conteúdo bruto de requests/responses que possa conter autenticação;
- headers `Authorization`;
- headers `Cookie` ou `Set-Cookie`.

## Environment Variables

É permitido mencionar apenas o NOME de uma variável.

Permitido:

`JWT_SECRET`

`MONGO_URI`

`CLOUDINARY_API_KEY`

Não permitido:

`JWT_SECRET=my-real-secret`

`MONGO_URI=mongodb+srv://user:password@...`

Nunca copie valores de `.env` para uma spec.

## URLs

Prefira placeholders.

Permitido:

`https://api.example.com`

`{API_BASE_URL}`

`process.env.API_URL`

Não permitido:

URLs privadas de produção ou homologação que contenham informações sensíveis.

## Authentication

Descreva mecanismos, nunca credenciais reais.

Permitido:

"Use Bearer token no header Authorization."

Não permitido:

"Authorization: Bearer eyJhbGci..."

## Database

Descreva schemas e comportamentos.

Não inclua:

- usuários reais;
- documentos reais;
- IDs reais quando forem sensíveis;
- dumps;
- connection strings;
- credentials.

Use dados fictícios em exemplos.

## Examples

Todo exemplo deve utilizar valores artificiais.

Bom:

```json
{
  "email": "user@example.com",
  "token": "<ACCESS_TOKEN>"
}