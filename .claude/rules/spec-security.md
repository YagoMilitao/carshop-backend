# Specs Security Rules

`specs/` may contain decisions and requirements.
It must never contain credentials, secrets, or real environment values.

Everything inside `specs/` is considered potentially public and versioned in Git.

Therefore, never write the following into `specs/`:

- passwords;
- tokens;
- API keys;
- JWT secrets;
- cookies;
- session IDs;
- database credentials;
- connection strings;
- real `.env` values;
- real `.env` content;
- private keys;
- private certificates;
- credentials JSON;
- service accounts;
- access tokens;
- refresh tokens;
- OAuth client secrets;
- webhook secrets;
- personal user data;
- private emails when not necessary;
- internal IPs;
- internal hostnames;
- private service URLs;
- signed URLs;
- tokens present in URLs;
- real production data;
- database dumps;
- stack traces containing sensitive data;
- raw request/response content that may contain authentication data;
- `Authorization` headers;
- `Cookie` or `Set-Cookie` headers.

## Environment Variables

Only the NAME of a variable may be mentioned.

Allowed:

`JWT_SECRET`

`MONGO_URI`

`CLOUDINARY_API_KEY`

Not allowed:

`JWT_SECRET=my-real-secret`

`MONGO_URI=mongodb+srv://user:password@...`

Never copy `.env` values into a spec.

## URLs

Prefer placeholders.

Allowed:

`https://api.example.com`

`{API_BASE_URL}`

`process.env.API_URL`

Not allowed:

Private production or staging URLs that contain sensitive information.

## Authentication

Describe mechanisms, never real credentials.

Allowed:

"Use a Bearer token in the Authorization header."

Not allowed:

"Authorization: Bearer eyJhbGci..."

## Database

Describe schemas and behaviors.

Do not include:

- real users;
- real documents;
- real IDs when sensitive;
- dumps;
- connection strings;
- credentials.

Use fictitious data in examples.

## Examples

Every example must use artificial values.

Good:

```json
{
  "email": "user@example.com",
  "token": "<ACCESS_TOKEN>"
}
