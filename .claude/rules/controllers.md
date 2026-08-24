---
paths:
  - 'src/presentation/controllers/**/*.ts'
  - 'src/presentation/helpers/**/*.ts'
  - 'src/infra/http/routes/**/*.ts'
  - 'src/infra/presentation/validators/**/*.ts'
---

# Controllers and routes

- Keep controllers thin: adapt Express, validate input, call a use case, and map the result to an HTTP response. Business rules belong in the use case or application service.
- Validate bodies with Zod schemas and `validateWithSchema` when the payload has structure. Validate route params with the existing helpers.
- Preserve the `async` arrow handler pattern and catch failures as `unknown`, forwarding them to the central middleware with `next(error)`.
- Compose controllers, use cases, and middlewares in the route builders. Do not import Mongoose models directly into controllers.
- Admin routes must use `authMiddleware`. `POST /auth/refresh` and `POST /auth/logout` must keep `csrfProtectionMiddleware`.
- Do not silently change HTTP status, response format, cookie names, or headers that are already part of the public contract.
- When creating or modifying endpoints, update the controller/route tests, the corresponding Swagger fragment, and the affected OpenAPI schemas.
