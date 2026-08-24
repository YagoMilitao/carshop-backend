# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

Before implementing anything, read and follow:

@.claude/rules/architecture.md
@.claude/rules/controllers.md
@.claude/rules/openapi.md
@.claude/rules/persistence.md
@.claude/rules/security.md
@.claude/rules/testing.md
@.claude/rules/typescript.md
@.claude/rules/usecases.md
@.claude/rules/spec-security.md

Also use these documents as sources of truth:

@README.md

## Public Repository Safety

Treat all files under `specs/` as public information.

Never copy secrets, credentials, `.env` values, private URLs,
production data or sensitive user information into specifications.

Specifications may reference environment variable names but never
their actual values.

## Swagger

- Swagger UI is served at `GET /docs`, and the OpenAPI JSON document is served at `GET /docs.json`.
- Swagger availability is controlled by `ENABLE_SWAGGER` and `NODE_ENV`; it is disabled by default in production and enabled by default in other environments.
- The OpenAPI fragments live in `src/infra/docs/*.swagger.ts` and are assembled by `src/infra/swagger.ts` using the existing merge helpers.
- Whenever an endpoint, payload, response, status code, authentication requirement, cookie, or header changes, update the corresponding Swagger fragment and tests in the same change.
- Keep the documented contract synchronized with the actual routes, middlewares, controllers, and validation schemas.

## Project overview

Node.js/Express + TypeScript backend for a car-upholstery-restoration shop portfolio site. The shop owner (admin) uploads photos of finished jobs ("works") to Cloudinary; visitors browse published works and leave comments that require admin approval before they appear publicly. Auth is JWT access+refresh with rotating sessions and CSRF protection. Data is persisted in MongoDB via Mongoose.

## Agent workflow

Project subagents live in `.claude/agents/`.
## Spec-Driven Development Workflow

Non-trivial implementation work originating from a `CARSHOP-{number}`
task follows Spec-Driven Development.

Mandatory pipeline:

task-reader
    ↓
spec-writer
    ↓
knowledge-reader (when relevant)
    ↓
arquiteto
    ↓
READY FOR IMPLEMENTATION?
    ├── no → STOP
    └── yes
          ↓
      desenvolvedor
          ↓
        tester
          ↓
       reviewer
          ↓
      quality gate
          ↓
     task-manager
          ↓
  knowledge-manager

- `task-manager`: atualiza de forma controlada o estado e o resultado técnico da tarefa no Notion depois que o quality gate foi aprovado; não altera requisitos.
- `task-reader`: retrieves a task from Notion by its project ID (e.g. `CARSHOP-21`) and returns structured requirements/DoD; read-only, does not touch the repository.
- `arquiteto`: read-only analysis and implementation planning for non-trivial changes.
- `desenvolvedor`: implements an approved plan end-to-end without committing or pushing.
- `tester`: creates or updates tests under `test/` and runs the relevant validation commands; it does not edit production code.
- `reviewer`: performs an independent read-only review, reporting findings by severity with file and line evidence.
- `spec-writer`: converts structured Notion requirements into a
  versioned, testable specification under `specs/CARSHOP-{number}/`;
  it does not make architectural decisions.

The mandatory workflow is:

task-reader
    ↓
arquiteto
    ↓
READY FOR IMPLEMENTATION?
    ├── no  → STOP
    └── yes
          ↓
    desenvolvedor
          ↓
        tester
          ↓
       reviewer
          ↓
       task-manager
          ↓
    quality gate

### Specification Gate

Production implementation must not begin until a versioned specification
exists for non-trivial `CARSHOP-{number}` work.

Expected location:

specs/CARSHOP-{number}/spec.md

The specification defines WHAT must be achieved.

The architect defines HOW the current system should achieve it.

The developer implements the approved plan.

Never modify the specification merely to make an implementation easier.

If implementation reveals a genuine requirement problem:

STOP

Return the issue to the coordinator.

Update the specification only when the requirement itself has been
clarified or changed.

### Phase 1 — Requirements

When the user references a task using `CARSHOP-{number}`:

1. Invoke `task-reader`.
2. Retrieve the task from Notion.
3. Treat its structured output as the product specification.

Do not ask the user to manually copy requirements that can be obtained from Notion.

If `task-reader` reports BLOCKING information, stop the workflow.

### Phase 2 — Architecture

Pass the complete task-reader output to `arquiteto`.

The architect must inspect the repository and return either:

- `READY FOR IMPLEMENTATION`
- `BLOCKED`

Only continue when the verdict is `READY FOR IMPLEMENTATION`.

### Phase 3 — Implementation

Pass to `desenvolvedor`:

- original task ID;
- task-reader specification;
- architect plan.

The developer must not reinterpret product requirements.

### Phase 4 — Testing

After implementation, invoke `tester`.

The tester receives:

- original specification;
- architect plan;
- developer summary;
- current diff.

### Phase 5 — Review

After testing, invoke `reviewer`.

The reviewer receives:

- original specification;
- architect plan;
- implementation;
- test results;
- current diff.

### Phase 6 — Task Completion

After `reviewer` completes successfully, evaluate the quality gate.

The quality gate passes only when:

- implementation is complete;
- required validation was executed;
- acceptance criteria are satisfied;
- no BLOCKER finding remains open;
- no HIGH finding remains open.

When the quality gate passes and the work originated from a
`CARSHOP-{number}` task, invoke `task-manager`.

Pass to `task-manager`:

- task ID;
- original task-reader specification;
- developer implementation summary;
- tester validation results;
- reviewer findings/verdict.

The task-manager may update the Notion task to `Done` and record a concise
technical completion summary.

The task-manager must never change product requirements, Description,
Definition of Done, Priority, Sprint, Epic or other planning properties
unless the user explicitly requested that change.

If the quality gate does not pass:

DO NOT invoke task-manager for completion.

Return the focused problem to the appropriate agent.

### Phase 7 — Knowledge Evaluation

After a Notion task successfully passes the quality gate and
`task-manager` completes its work, invoke `knowledge-manager`.

Pass:

- task ID;
- structured specification;
- architect decisions;
- developer implementation summary;
- tester results;
- reviewer verdict.

The knowledge-manager must first evaluate whether reusable engineering
knowledge was produced.

It must NOT create a note simply because a task was completed.

Knowledge worthy of persistence includes:

- architectural decisions;
- reusable engineering patterns;
- important technical learnings;
- non-obvious troubleshooting knowledge.

If no reusable knowledge exists:

`NO KNOWLEDGE TO RECORD`

and the workflow ends.

If reusable knowledge exists:

1. search existing Obsidian notes;
2. avoid duplication;
3. classify the knowledge;
4. create or update the appropriate note within `CarShop/`.

The knowledge-manager must never use Obsidian as a duplicate task tracker.

### Quality Gate

If reviewer reports:

BLOCKER
or
HIGH

the task is not complete.

Send only the focused findings back to `desenvolvedor`.

Then run:

desenvolvedor
    ↓
tester
    ↓
reviewer

again.

Do not restart architecture unless the finding exposes an architectural problem.

## Commands

```bash
npm run start:dev        # run with ts-node (transpile-only, fast reload-free dev)
npm run start            # run with ts-node (full type-checking)
npm run build             # compile to dist/ via tsc -p tsconfig.build.json
npm run start:prod        # run compiled output (node dist/main/index.js)

npm run lint              # eslint --fix on src/ and test/
npm run format             # prettier --write on src/ and test/

npm test                  # jest unit tests (test/unit/**/*.spec.ts)
npm run test:watch        # jest watch mode
npm run test:coverage     # jest with coverage -> coverage/lcov.info (consumed by Sonar)
npm run test:e2e          # jest with test/jest-e2e.json config (test/e2e/**/*.e2e-spec.ts)
```

Run a single unit test file:

```bash
npx jest test/unit/core/domain/application/Auth/auth.service.spec.ts
```

Run a single e2e test file:

```bash
npx jest --config ./test/jest-e2e.json test/e2e/app.e2e-spec.ts
```

Unit tests require env vars to be set (there's no `.env` loaded automatically for `test`) — `test/jest.setup.ts` only patches a `jest-mock` internal, it does not seed env. Individual specs typically set `process.env.*` themselves before importing modules that read `env`.

### Knowledge Retrieval

Before architecture analysis for non-trivial changes, determine whether
historical engineering knowledge could materially influence the solution.

Invoke `knowledge-reader` when the task involves:

- architecture;
- authentication or authorization;
- security;
- persistence;
- external integrations;
- API contracts;
- infrastructure;
- shared services;
- reusable patterns;
- cross-cutting concerns;
- significant technical decisions.

Pass the task-reader specification to `knowledge-reader`.

The knowledge-reader must search Obsidian by technical concepts,
not only by task ID.

Pass relevant knowledge to `arquiteto` together with the original
task specification.

For trivial changes where historical knowledge cannot materially affect
the solution, skip knowledge-reader.

## Architecture

The app follows a hexagonal-ish layering, but the layer names don't map 1:1 onto top-level folders — pay attention to actual import paths, not just directory names:

- **`src/core/domain`** — domain layer: entities/types and _ports_ (interfaces only). `application/Auth/*.port.ts` defines `TokenServicePort` and `admin-credentials-provider.port.ts`; `repositories/*.repository.ts` defines `WorkRepositoryPort`, `CommentRepositoryPort`, `SessionStorePort` as interfaces (despite the "repository" filename, these are ports, not implementations). `application/Auth/auth.service.ts` is the actual business-logic `AuthService`, depending only on ports.
- **`src/data/models`** — Mongoose schemas/models (`work.model.ts`, `comment.model.ts`, `auth-session.model.ts`, `category.model.ts`, `tag.model.ts`, `work-image.model.ts`, `admin-user.model.ts`).
- **`src/usecase`** — one class per use case (`create-work.use-case.ts`, `list-works.use-case.ts`, `create-comment.use-case.ts`, `approve-comment.use-case.ts`, `upload-work-image.use-case.ts`, etc.). Each takes repository _ports_ via constructor injection and contains the actual business rule.
- **`src/presentation/controllers`** — Express controllers (`work.controller.ts`, `comment.controller.ts`, `admin-comment.controller.ts`, `work-image.controller.ts`, `auth.controller.ts`). Controllers parse/validate the request, call a use case, and map the result to an HTTP response; errors are passed to `next()` for the central error handler.
- **`src/presentation/helpers`** — controller-adjacent helpers (`auth.cookies.ts` for setting/clearing the refresh/CSRF cookies, `login.validator.ts`, `route-param.helper.ts`).
- **`src/infra`** — infrastructure/adapters and the composition root:
  - `infra/server.ts` — **the real composition root**, invoked by `src/main/index.ts`. Instantiates concrete repositories/services, wires `AuthService`, registers middlewares, swagger, and routes. (`src/infra/http/server.ts` is a legacy/unused file — a standalone `app` never wired into `main/index.ts`; don't confuse it with `infra/server.ts`.)
  - `infra/config/env.ts` — typed, validated env loading (throws at startup if required vars are missing).
  - `infra/config/middleware.ts` — global middleware registration (helmet, cors, rate limit, json body parser, morgan) plus terminal middlewares (404, error handler).
  - `infra/config/routes.ts` — mounts the four route groups: `/auth`, `/works`, `/admin/comments`, `/admin/works`.
  - `infra/http/routes/*.routes.ts` — per-feature router builders. Each one instantiates its own use cases/controllers from injected ports and wires the auth middleware onto the routes that need it. This is where controllers, use cases, and ports actually get connected — read here first to trace a request end-to-end.
  - `infra/repositories/mongo-*.repository.ts` — concrete Mongoose-backed implementations of the domain ports (plus `in-memory-session-store.repository.ts`, used in tests or as a fallback).
  - `infra/gateway/cloudinary/cloudinary-storage.service.ts` — the real `ImageStoragePort` implementation used by `infra/server.ts`. (`src/core/domain/application/Gateway/cloudinary/cloudinary-storage.service.ts` is a duplicate left over from an earlier layering pass — not imported by the composition root.)
  - `infra/services/jsonwebtoken-token.service.ts` — `TokenServicePort` implementation using `jsonwebtoken`.
  - `infra/middleware/upload.middleware.ts` — Multer config (5 MB limit, JPEG/PNG/WebP only, temp storage in `tmp/uploads`) used by the work-image upload route.
  - `infra/presentation/middleware/*` — `auth.middleware.ts` (JWT bearer validation + session lookup), `csrf-protection.middleware.ts` (double-submit check for `/auth/refresh` and `/auth/logout`), `rate-limit.middleware.ts`, `error-handler.middleware.ts`, `not-found.middleware.ts`.
  - `infra/docs/*.swagger.ts` + `infra/swagger.ts` — hand-written OpenAPI fragments merged and served at `GET /docs` (UI) and `GET /docs.json`, gated by `ENABLE_SWAGGER`/`NODE_ENV` (see `infra/config/env.ts` and `infra/swagger.ts`).
- **`src/main/index.ts`** — process entrypoint: connects Mongoose, calls `createApp()` from `infra/server.ts`, starts the HTTP listener.

There are also several `.gitkeep`-only placeholder directories (`src/adapter/*`, `src/data/protocols/*`, `src/main/controllers`, `src/main/routes`, `src/utils`) reserved for future layering but currently empty — don't assume code lives there.

Three ambient Express `Request.auth` declarations exist (`src/@types/express/index.d.ts`, `src/types/express.d.ts`, `src/presentation/protocols/express.d.ts`); they overlap via declaration merging. If you need to change the shape of `request.auth`, update `core/domain/application/Auth/auth.types.ts`'s `AuthenticatedRequestContext` and check all three files stay consistent.

### Request flow example (creating a work image)

`infra/http/routes/work-image.routes.ts` → `uploadMiddleware` (multer) → `authMiddleware` (JWT + session check) → `WorkImageController` → `UploadWorkImageUseCase` → `ImageStoragePort` (Cloudinary) + `WorkRepositoryPort` (Mongo).

### Auth model

- Login (`POST /auth/login`) issues a short-lived JWT access token (body) plus an `HttpOnly` `refresh_token` cookie and a readable `csrf_token` cookie (double-submit pattern).
- `POST /auth/refresh` and `POST /auth/logout` require the `X-CSRF-Token` header to match the `csrf_token` cookie, and rotate the session on refresh.
- Sessions are tracked server-side (`SessionStorePort`, Mongo-backed) so logout/revocation is explicit, not just token expiry.
- `infra/presentation/middleware/auth.middleware.ts` validates the bearer token, its type, and the session status before attaching `request.auth`.

## Environment variables

`.env.example` is the authoritative list (more complete than the README): `NODE_ENV`, `PORT`, `CORS_ORIGIN`, `MONGO_URI`, `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `JWT_SECRET`, `JWT_EXPIRES_IN`, `JWT_REFRESH_EXPIRES_IN`, `JWT_REFRESH_COOKIE_MAX_AGE_MS`, `ENABLE_SWAGGER`, `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`. `infra/config/env.ts` throws at startup if a required var (`MONGO_URI`, `JWT_SECRET`, `ADMIN_EMAIL`, `ADMIN_PASSWORD`) is missing.

## Testing conventions

- Unit tests live under `test/unit/`, mirroring the `src/` path of the file under test (e.g. `src/infra/repositories/mongo-work.repository.ts` → `test/unit/infra/repositories/mongo-work.repository.spec.ts`). When adding a new source file, put its spec at the matching mirrored path.
- E2E tests live under `test/e2e/*.e2e-spec.ts` and run under a separate Jest config (`test/jest-e2e.json`) — they are not picked up by plain `npm test`.
- The `@/*` path alias maps to `src/*` (see `tsconfig.json` and both Jest configs' `moduleNameMapper`); most existing code uses relative imports, but `@/` is valid and used in a few files.
- Repository tests (`mongo-*.repository.spec.ts`) mock the Mongoose models directly with `jest.mock('.../data/models/...')` rather than hitting a real database. `mongodb-memory-server` is a devDependency but isn't wired into the current unit test suite.

## Obsidian Knowledge Base

Long-term engineering knowledge for this project is stored in Obsidian.

Vault:

Defined by the `OBSIDIAN_VAULT_ID` environment variable (see `.env.example`).
Never hardcode the vault ID here or in any other committed file — it
identifies a local, machine-specific vault.

Project knowledge root:

`CarShop/`

Allowed knowledge directories:

- `CarShop/Architecture/`
- `CarShop/ADR/`
- `CarShop/Patterns/`
- `CarShop/Learnings/`
- `CarShop/Troubleshooting/`

The `knowledge-manager` must never write outside this scope.
