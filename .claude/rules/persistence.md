---
paths:
  - 'src/data/models/**/*.ts'
  - 'src/infra/repositories/**/*.ts'
  - 'src/infra/gateway/**/*.ts'
---

# Persistence and integrations

- Keep Mongoose and Cloudinary details inside infrastructure adapters.
- Convert persistence documents to domain types in explicit mapping functions. Dates exposed by the domain/API must follow the format already used by the project.
- Queries for active entities must consider `deletedAt: null` when the model uses soft delete.
- Preserve uniqueness, indexes, validations, and normalizations declared on the schemas when adding fields.
- Use `.lean()` on reads when Mongoose document behavior isn't needed, and keep the ordering defined by the requirements.
- Destructive and cascading operations must be explicit, limited to the requested identifier, and covered by tests.
- Do not expose credentials or raw provider responses. Translate external errors to the application's error contract when necessary.
- When changing a schema or mapping, update related types, ports, repository tests, and environment/contract documentation.
