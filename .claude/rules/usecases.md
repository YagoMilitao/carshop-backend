---
paths:
  - 'src/usecase/**/*.ts'
  - 'src/core/domain/**/*.ts'
---

# Domain and use cases

- Use cases must express business rules without knowing about Request/Response, Mongoose models, or external SDKs.
- Receive dependencies through ports and the constructor. Do not instantiate concrete repositories or gateways inside a use case.
- Validate invariants before persisting, and use `HttpError` with a status and message consistent with the rest of the API for expected failures.
- Normalize data at the boundary responsible for the rule, preserving the existing `trim()` and lowercase patterns for slug, category, tags, and equivalent fields.
- Return domain types, not Mongoose documents or provider-specific objects.
- When extending a port, update all affected implementations and test doubles.
- Cover the happy path, validations, and relevant failures with unit tests focused on observable behavior.
