---
paths:
  - 'src/**/*.ts'
  - 'test/**/*.ts'
---

# Testing and validation

- Unit tests live in `test/unit`, mirroring the file's path under `src`; E2E tests live in `test/e2e/*.e2e-spec.ts`.
- Use Jest and follow the mocking patterns already present. Mongo repositories are tested by mocking the Mongoose models, without a real connection by default.
- Set test environment variables before importing modules that read `process.env`, and restore global state after each scenario.
- Every bug fix must include a test that fails without the fix. Every feature must cover the happy path, validation, and the main error case.
- Test observable behavior and contracts; avoid coupling tests to internal details that aren't part of the requirement.
- Run the most specific test first. Then run `npm test` and `npm run build` when there's a TypeScript change.
- Run `npm run test:e2e` when routes, middlewares, authentication, cookies, server composition, or end-to-end HTTP contracts change.
- Do not remove assertions, skip tests, or reduce coverage just to make the suite pass. If a failure is pre-existing, record evidence in the final result.
