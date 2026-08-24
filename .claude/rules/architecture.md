---
paths:
  - 'src/**/*.ts'
---
# Architecture Rules

Before implementing a feature:

1. Understand the current architecture.
2. Identify which layer owns the responsibility.
3. Inspect similar implementations already present in the project.
4. Reuse existing patterns whenever appropriate.
5. Do not introduce a new architectural pattern without justification.


# Architecture and dependencies

- Respect the direction of dependencies: the domain and use cases must not depend on Express, Mongoose, Cloudinary, or infrastructure details.
- Put boundary contracts in domain ports and concrete implementations in `src/infra`. Only create a new abstraction when a real boundary needs to be isolated.
- Put business rules in `src/usecase`, or in the auth module's `AuthService`. A use case must depend on ports injected through the constructor.
- Use `src/infra/server.ts` as the main composition root and the builders in `src/infra/http/routes` for per-feature composition.
- Do not implement new features in `src/infra/http/server.ts`; that file is legacy and is not called by `src/main/index.ts`.
- Use `src/infra/gateway/cloudinary/cloudinary-storage.service.ts` as the active image adapter. The Cloudinary file under `src/core/domain/application/Gateway` is a legacy duplicate.
- When adding an HTTP feature, check the full flow: contract/types, port, use case, adapter, controller, route, composition root, documentation, and tests.
- Preserve compatibility of public contracts unless the specification explicitly requests a breaking change.

Avoid:

- God classes
- God components
- Business rules inside controllers
- Business rules inside React components
- Circular dependencies
- Cross-layer imports
- Duplicated abstractions
- Premature abstraction

When there are multiple possible implementations, explain the trade-offs before choosing one.
