---
paths:
  - 'src/infra/docs/**/*.ts'
  - 'src/infra/swagger.ts'
  - 'src/infra/http/routes/**/*.ts'
  - 'src/presentation/controllers/**/*.ts'
---

# OpenAPI and HTTP contract

- The actual behavior of the route, controller, and middleware is the source for documenting the endpoint; do not document a contract the code doesn't deliver.
- Keep per-domain fragments in `src/infra/docs` and use the existing merge mechanism to preserve different operations on the same path.
- Document parameters, body, success responses, main errors, authentication, and applicable CSRF protection.
- Reuse existing schemas and security schemes before duplicating them.
- Preserve the `/docs` and `/docs.json` endpoints and the `ENABLE_SWAGGER`/`NODE_ENV` gating.
- When the contract changes, update documentation and tests in the same set of changes.
