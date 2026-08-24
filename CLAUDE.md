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

---

# Public Repository Safety

Treat all files under `specs/` as public information.

Never copy secrets, credentials, `.env` values, private URLs,
production data or sensitive user information into specifications.

Specifications may reference environment variable names but never
their actual values.

If any agent detects a possible secret, credential, token, private key,
connection string, production credential or other sensitive value in a
versioned file:

1. Do not reproduce the value in agent output.
2. Refer to it using `<REDACTED>`.
3. Report the affected file.
4. Treat the finding as a `BLOCKER`.
5. Do not consider the task complete until the exposure has been handled.

Everything written under `specs/` must be safe to publish in a public
GitHub repository.

---

# Swagger

- Swagger UI is served at `GET /docs`, and the OpenAPI JSON document is served at `GET /docs.json`.
- Swagger availability is controlled by `ENABLE_SWAGGER` and `NODE_ENV`; it is disabled by default in production and enabled by default in other environments.
- The OpenAPI fragments live in `src/infra/docs/*.swagger.ts` and are assembled by `src/infra/swagger.ts` using the existing merge helpers.
- Whenever an endpoint, payload, response, status code, authentication requirement, cookie, or header changes, update the corresponding Swagger fragment and tests in the same change.
- Keep the documented contract synchronized with the actual routes, middlewares, controllers, and validation schemas.

---

# Project Overview

Node.js/Express + TypeScript backend for a car-upholstery-restoration shop portfolio site.

The shop owner (admin) uploads photos of finished jobs ("works") to Cloudinary.

Visitors browse published works and leave comments that require admin approval before they appear publicly.

Authentication uses JWT access + refresh tokens with rotating sessions and CSRF protection.

Data is persisted in MongoDB via Mongoose.

---

# Agent Workflow

Project subagents live in:

`.claude/agents/`

Each agent's declared tools and permissions are security boundaries, not suggestions.

Agents must not use broader capabilities or indirect workarounds to bypass those boundaries.

Available specialized agents:

- `task-reader`: retrieves a task from Notion by its project ID, such as `CARSHOP-21`, and returns structured requirements and Definition of Done. Read-only and does not touch the repository.
- `spec-writer`: converts structured Notion requirements into a versioned, testable specification under `specs/CARSHOP-{number}/`. It does not make architectural decisions.
- `knowledge-reader`: retrieves relevant historical engineering knowledge from the CarShop Obsidian knowledge base. Read-only.
- `architect`: performs read-only repository analysis and implementation planning for non-trivial changes.
- `developer`: implements an approved plan end-to-end without committing or pushing.
- `tester`: creates or updates tests under `test/` and runs relevant validation commands. It does not edit production code.
- `reviewer`: performs an independent read-only review and reports findings by severity with file and line evidence.
- `task-manager`: controllably updates the task's operational state and technical outcome in Notion after the quality gate passes. It does not change product requirements.
- `knowledge-manager`: evaluates completed work and records reusable engineering knowledge in Obsidian when appropriate.
- `plan-writer`: persists an approved architect plan under
`specs/CARSHOP-{number}/plan.md`; it does not make architectural
decisions and cannot edit production code.

The main Claude conversation acts as the workflow coordinator.

---

# Agent Security and Least Privilege

All specialized agents must follow the principle of least privilege.

An agent must have access only to the tools, files, services, environment
variables and operations required to perform its assigned responsibility.

Access available to one agent must not be assumed to be appropriate for
another agent.

## General Rules

Agents must:

- use only the minimum capabilities required for their role;
- respect their declared read/write boundaries;
- access only the external services required by their responsibility;
- avoid reading files unrelated to their task;
- avoid accessing environment variables unrelated to their task;
- avoid passing unrelated environment variables to child processes;
- never broaden their own permissions to make a task easier;
- never bypass another agent's responsibility boundary.

If an agent cannot complete its responsibility with its permitted access:

`STOP`

Return:

`BLOCKED`

Explain which capability is missing and why it is required.

Do not work around the restriction by using another available tool.

## Environment Isolation

Agents must follow least-privilege access to environment variables.

Never source the complete application environment merely to obtain one
configuration value.

Agents must not run commands whose purpose is to enumerate or expose the
complete process environment, including:

- `env`
- `printenv`
- `export -p`
- `set` for environment discovery
- `source .env`
- `. .env`
- `set -a && source .env`

unless an explicitly documented agent responsibility requires loading that
environment and the operation has been intentionally approved.

When an agent requires a specific environment variable, that variable should
already be available in the agent's process environment.

The agent may verify the presence of the required variable without printing
its value.

Example:

```bash
test -n "${OBSIDIAN_VAULT_ID:-}"
```

# Spec-Driven Development Workflow

Non-trivial implementation work originating from a `CARSHOP-{number}`
task follows Spec-Driven Development.

## Canonical Pipeline

This is the single canonical mandatory workflow:

```text
task-reader
    ↓
spec-writer
    ↓
knowledge-reader (when relevant)
    ↓
architect
    ↓
READY FOR IMPLEMENTATION?
    ├── no → STOP
    └── yes
          ↓
      plan-writer
          ↓
      developer
          ↓
        tester
          ↓
       reviewer
          ↓
      quality gate
       ├── fail → focused correction loop
       └── pass
              ↓
         task-manager
              ↓
      knowledge-manager
```

## Workflow Authority

The pipeline defined above is the single canonical workflow for
non-trivial `CARSHOP-{number}` implementation tasks.

No other section may define a conflicting or alternative mandatory pipeline.

The phase descriptions below explain this pipeline. They do not replace,
reorder or omit its stages.

If any later instruction conflicts with the canonical pipeline, the
canonical pipeline takes precedence.

A stage may only be skipped when this document explicitly marks it as
conditional.

Currently, only `knowledge-reader` is conditional.

---


# Specification Gate

Production implementation must not begin until a versioned specification
exists for non-trivial `CARSHOP-{number}` work.

Expected location:

`specs/CARSHOP-{number}/spec.md`

The specification defines **WHAT** must be achieved.

The architect defines **HOW** the current system should achieve it.

The developer implements the approved plan.

Never modify the specification merely to make an implementation easier or
to make failing tests pass.

If implementation reveals a genuine requirement problem:

`STOP`

Return the issue to the coordinator.

Update the specification only when the requirement itself has been
clarified or changed.

---

# Phase 1 — Requirements Retrieval

When the user references a task using `CARSHOP-{number}`:

1. Invoke `task-reader`.
2. Retrieve the task from Notion.
3. Treat its structured output as the source requirements for the specification.

Do not ask the user to manually copy requirements that can be obtained from Notion.

The task-reader must not invent missing information.

If `task-reader` reports `BLOCKING` information:

`STOP`

Do not invoke `spec-writer`.

---

# Phase 2 — Specification

Pass the complete `task-reader` output to `spec-writer`.

The `spec-writer` must create or update:

`specs/CARSHOP-{number}/spec.md`

The specification must contain testable requirements and acceptance criteria
without prematurely defining implementation details that belong to the architect.

The specification must comply with:

@.claude/rules/spec-security.md

Before continuing, the specification must be:

`READY`

If the specification reports:

`BLOCKED`

then:

`STOP`

Do not invoke `knowledge-reader`, `architect` or `developer`.

---

# Phase 3 — Knowledge Retrieval

Before architecture analysis, determine whether historical engineering
knowledge could materially influence the solution.

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

Pass the versioned specification to `knowledge-reader`.

The `knowledge-reader` must search Obsidian using technical concepts,
not only the task ID.

Relevant historical knowledge must be passed to `architect`.

For trivial changes where historical knowledge cannot materially affect
the solution, `knowledge-reader` may be skipped.

Obsidian provides historical engineering context.

It is not the source of truth for the current implementation.

The repository remains the source of truth for the current code.

---

# Phase 4 — Architecture

Pass to `architect`:

- original task ID;
- versioned specification;
- relevant historical knowledge when available.

The architect must inspect the actual repository before proposing a solution.

The architect must validate historical decisions against the current code.

If Obsidian and the repository disagree, the architect must explicitly
identify the conflict and determine the current behavior from the repository.

The architect must return exactly one implementation verdict:

- `READY FOR IMPLEMENTATION`
- `BLOCKED`

Only continue when the verdict is:

`READY FOR IMPLEMENTATION`

If the architect returns:

`BLOCKED`

then:

`STOP`

Do not invoke `developer`.

---
# Phase 5 — Plan Persistence

When `architect` returns:

`READY FOR IMPLEMENTATION`

invoke `plan-writer`.

Pass:

- original task ID;
- versioned specification;
- complete architect output.

The plan-writer must persist the approved plan at:

`specs/CARSHOP-{number}/plan.md`

The plan-writer must not introduce new architectural decisions.

Implementation cannot begin until `plan.md` exists successfully.

If plan persistence fails:

`STOP`

Do not invoke `developer`.

# Phase 6 — Implementation

Pass to `developer`:

- original task ID;
- `specs/CARSHOP-{number}/spec.md`;
- `specs/CARSHOP-{number}/plan.md`;
- architect plan;
- relevant historical knowledge when it materially affects implementation.

The developer must implement the approved plan.

The developer must not reinterpret product requirements.

The developer must not silently change the specification.

The developer must preserve unrelated existing changes.

The developer must not commit or push.

If implementation reveals a decision that cannot safely be made from the
approved specification and architecture:

`STOP`

Return the issue to the coordinator for classification.

---

# Phase 7 — Testing

After implementation, invoke `tester`.

The tester receives:

- original task ID;
- versioned specification;
- architect plan;
- developer implementation summary;
- current diff.

The tester must map verification to the specification's acceptance criteria.

When the specification contains IDs such as:

- `FR-*`
- `NFR-*`
- `AC-*`

the tester must use them for traceability where applicable.

Example:

```text
AC-001 → PASS
AC-002 → PASS
AC-003 → NOT VERIFIED
```

The tester may create or update tests under `test/`.

The tester must not fix production code.

If a production defect is discovered, report it back to the coordinator.

Never modify the specification merely to make a test pass.

---

# Phase 8 — Review

After testing, invoke `reviewer`.

The reviewer receives:

- original task ID;
- versioned specification;
- architect plan;
- implementation;
- tester results;
- current diff.

The reviewer must independently inspect the diff and relevant surrounding code.

Do not rely only on the developer summary.

The reviewer must evaluate:

- correctness;
- specification compliance;
- architecture;
- security;
- persistence;
- API contracts;
- Swagger synchronization when applicable;
- test coverage;
- regressions;
- scope creep;
- accidental disclosure of sensitive information.

When a versioned specification exists, also verify:

- implemented requirements;
- acceptance criteria;
- unrequested behavior;
- divergence between implementation and specification.

Use:

`SPEC VIOLATION`

when implementation contradicts an explicit requirement or acceptance criterion.

Use:

`SCOPE CREEP`

when implementation introduces significant behavior not justified by the
specification or approved plan.

Any secret, credential or sensitive production information accidentally
included in `specs/` or another versioned file is a:

`BLOCKER`

---

# Phase 9 — Quality Gate

After `reviewer` completes, evaluate the quality gate.

The quality gate passes only when:

- implementation is complete;
- required validation was executed;
- acceptance criteria are satisfied;
- no `BLOCKER` finding remains open;
- no `HIGH` finding remains open;
- no unresolved specification violation prevents acceptance;
- no sensitive information exposure remains unresolved.

If reviewer reports:

`BLOCKER`

or

`HIGH`

the task is not complete.

Do not invoke `task-manager` for completion.

Send only the focused findings back to `developer`.

Then run:

```text
developer
    ↓
tester
    ↓
reviewer
    ↓
quality gate
```

again.

Do not restart architecture unless the finding exposes an architectural problem.

If the finding exposes a requirement/specification problem:

`STOP`

Return the issue to the coordinator instead of silently modifying the spec.

---

# Phase 10 — Task Completion

Only after the quality gate passes may `task-manager` be invoked.

When the work originated from a `CARSHOP-{number}` task, pass to
`task-manager`:

- task ID;
- original task-reader requirements;
- versioned specification;
- developer implementation summary;
- tester validation results;
- reviewer findings/verdict;
- quality gate result.

The task-manager may update the Notion task to `Done` and record a concise
technical completion summary.

The task-manager must never fabricate implementation, testing or review results.

The task-manager must never change:

- product requirements;
- Description;
- Definition of Done;
- Priority;
- Sprint;
- Epic;
- other planning properties;

unless the user explicitly requests that planning change.

Explicit user requests do not authorize fabrication of workflow evidence.

If the quality gate does not pass:

`DO NOT invoke task-manager for completion.`

---

# Phase 11 — Knowledge Evaluation

After:

1. the quality gate passes; and
2. `task-manager` successfully completes its work;

invoke `knowledge-manager`.

Pass:

- task ID;
- versioned specification;
- architect decisions;
- developer implementation summary;
- tester results;
- reviewer verdict.

The knowledge-manager must first evaluate whether reusable engineering
knowledge was produced.

It must not create a note simply because a task was completed.

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

---

# Unexpected Change Requests

During implementation, external coding agents such as Codex may identify
changes that were not explicitly covered by the approved plan.

Do not accept such changes automatically.

Suggestions produced by external coding agents are proposals, not sources
of truth.

Never accept a Codex, Claude or other external-agent suggestion solely
because the agent recommended it.

Classify the proposed change first.

## Developer-Level Change

The developer may proceed when the change:

- is internal to the approved implementation;
- does not change observable behavior;
- does not change contracts;
- does not change persistence;
- does not change security behavior;
- does not introduce a new dependency;
- does not expand task scope.

## Architecture-Level Change

Return the proposal to `architect` when it may affect:

- architecture;
- module boundaries;
- public contracts;
- APIs;
- persistence;
- authentication or authorization;
- security;
- external integrations;
- dependencies;
- shared abstractions;
- significant cross-cutting behavior.

The architect must evaluate the proposal against:

- the current specification;
- the existing repository;
- relevant historical knowledge.

If the architect changes the implementation plan without changing product
behavior, the specification does not need to change.

## Requirement-Level Change

If the proposed change alters **WHAT** the system must do rather than
**HOW** it is implemented:

`STOP`

Do not allow the developer or architect to silently modify the requirement.

Return the issue to the coordinator.

Determine whether the underlying Notion requirement needs clarification.

Only after the requirement has actually been clarified or changed may the
versioned specification be updated.

---

# Commands

```bash
npm run start:dev        # run with ts-node (transpile-only, fast reload-free dev)
npm run start            # run with ts-node (full type-checking)
npm run build            # compile to dist/ via tsc -p tsconfig.build.json
npm run start:prod       # run compiled output (node dist/main/index.js)

npm run lint             # eslint --fix on src/ and test/
npm run format           # prettier --write on src/ and test/

npm test                 # jest unit tests (test/unit/**/*.spec.ts)
npm run test:watch       # jest watch mode
npm run test:coverage    # jest with coverage -> coverage/lcov.info
npm run test:e2e         # jest with test/jest-e2e.json config
```

Run a single unit test file:

```bash
npx jest test/unit/core/domain/application/Auth/auth.service.spec.ts
```

Run a single e2e test file:

```bash
npx jest --config ./test/jest-e2e.json test/e2e/app.e2e-spec.ts
```

Unit tests require env vars to be set.

There is no `.env` loaded automatically for `test`.

`test/jest.setup.ts` only patches a `jest-mock` internal; it does not seed env.

Individual specs typically set `process.env.*` themselves before importing
modules that read `env`.

---

# Architecture

The app follows a hexagonal-ish layering, but the layer names do not map
1:1 onto top-level folders.

Pay attention to actual import paths, not just directory names.

## `src/core/domain`

Domain layer.

Contains entities/types and ports/interfaces.

`application/Auth/*.port.ts` defines ports such as:

- `TokenServicePort`
- `admin-credentials-provider.port.ts`

`repositories/*.repository.ts` defines ports such as:

- `WorkRepositoryPort`
- `CommentRepositoryPort`
- `SessionStorePort`

Despite the `repository` filename, these are ports, not implementations.

`application/Auth/auth.service.ts` is the actual business-logic
`AuthService`, depending only on ports.

## `src/data/models`

Mongoose schemas/models:

- `work.model.ts`
- `comment.model.ts`
- `auth-session.model.ts`
- `category.model.ts`
- `tag.model.ts`
- `work-image.model.ts`
- `admin-user.model.ts`

## `src/usecase`

One class per use case, including:

- `create-work.use-case.ts`
- `list-works.use-case.ts`
- `create-comment.use-case.ts`
- `approve-comment.use-case.ts`
- `upload-work-image.use-case.ts`

Each takes repository ports via constructor injection and contains the
business rule.

## `src/presentation/controllers`

Express controllers:

- `work.controller.ts`
- `comment.controller.ts`
- `admin-comment.controller.ts`
- `work-image.controller.ts`
- `auth.controller.ts`

Controllers:

1. parse/validate the request;
2. call a use case;
3. map the result to an HTTP response;
4. pass errors to `next()` for the central error handler.

## `src/presentation/helpers`

Controller-adjacent helpers including:

- `auth.cookies.ts`
- `login.validator.ts`
- `route-param.helper.ts`

## `src/infra`

Infrastructure/adapters and composition root.

### `src/infra/server.ts`

This is the real composition root.

It is invoked by:

`src/main/index.ts`

It:

- instantiates concrete repositories/services;
- wires `AuthService`;
- registers middlewares;
- registers Swagger;
- registers routes.

`src/infra/http/server.ts` is a legacy/unused file.

It contains a standalone `app` that is not wired into `main/index.ts`.

Do not confuse it with `src/infra/server.ts`.

### `src/infra/config/env.ts`

Typed, validated environment loading.

Throws at startup if required environment variables are missing.

### `src/infra/config/middleware.ts`

Global middleware registration:

- helmet;
- cors;
- rate limiting;
- JSON body parser;
- morgan.

Also registers terminal middleware:

- 404;
- error handler.

### `src/infra/config/routes.ts`

Mounts:

- `/auth`
- `/works`
- `/admin/comments`
- `/admin/works`

### `src/infra/http/routes/*.routes.ts`

Per-feature router builders.

Each one instantiates its own use cases/controllers from injected ports and
wires authentication middleware onto routes that require it.

This is where controllers, use cases and ports actually get connected.

Read here first when tracing a request end-to-end.

### `src/infra/repositories`

Contains concrete Mongoose-backed implementations of domain ports.

Also contains:

`in-memory-session-store.repository.ts`

used in tests or as a fallback.

### Cloudinary

The real `ImageStoragePort` implementation used by `infra/server.ts` is:

`src/infra/gateway/cloudinary/cloudinary-storage.service.ts`

The following file is a duplicate left from an earlier layering pass and is
not imported by the composition root:

`src/core/domain/application/Gateway/cloudinary/cloudinary-storage.service.ts`

### JWT

`src/infra/services/jsonwebtoken-token.service.ts`

implements `TokenServicePort` using `jsonwebtoken`.

### Upload Middleware

`src/infra/middleware/upload.middleware.ts`

uses Multer with:

- 5 MB limit;
- JPEG/PNG/WebP only;
- temporary storage under `tmp/uploads`.

It is used by the work-image upload route.

### Presentation Middleware

`src/infra/presentation/middleware/*` includes:

- `auth.middleware.ts`
- `csrf-protection.middleware.ts`
- `rate-limit.middleware.ts`
- `error-handler.middleware.ts`
- `not-found.middleware.ts`

### Swagger

`src/infra/docs/*.swagger.ts`

and:

`src/infra/swagger.ts`

contain the hand-written OpenAPI fragments and assembly logic.

Swagger is served through:

- `GET /docs`
- `GET /docs.json`

and is gated by:

- `ENABLE_SWAGGER`
- `NODE_ENV`

## `src/main/index.ts`

Process entrypoint.

It:

1. connects Mongoose;
2. calls `createApp()` from `infra/server.ts`;
3. starts the HTTP listener.

---

# Placeholder and Legacy Directories

Several `.gitkeep`-only placeholder directories exist:

- `src/adapter/*`
- `src/data/protocols/*`
- `src/main/controllers`
- `src/main/routes`
- `src/utils`

They are reserved for future layering but currently empty.

Do not assume code lives there.

Three ambient Express `Request.auth` declarations exist:

- `src/@types/express/index.d.ts`
- `src/types/express.d.ts`
- `src/presentation/protocols/express.d.ts`

They overlap through declaration merging.

If the shape of `request.auth` changes, update:

`src/core/domain/application/Auth/auth.types.ts`

specifically:

`AuthenticatedRequestContext`

and verify all three ambient declarations remain consistent.

---

# Request Flow Example

Creating a work image follows:

```text
infra/http/routes/work-image.routes.ts
    ↓
uploadMiddleware
    ↓
authMiddleware
    ↓
WorkImageController
    ↓
UploadWorkImageUseCase
    ↓
ImageStoragePort (Cloudinary)
+
WorkRepositoryPort (Mongo)
```

---

# Authentication Model

Login:

`POST /auth/login`

issues:

- short-lived JWT access token in the response body;
- `HttpOnly` `refresh_token` cookie;
- readable `csrf_token` cookie.

`POST /auth/refresh`

and:

`POST /auth/logout`

require the `X-CSRF-Token` header to match the `csrf_token` cookie.

Refresh rotates the session.

Sessions are tracked server-side using `SessionStorePort`, backed by Mongo,
so logout/revocation is explicit rather than relying only on token expiry.

`infra/presentation/middleware/auth.middleware.ts` validates:

- bearer token;
- token type;
- session status;

before attaching:

`request.auth`.

---

# Environment Variables

`.env.example` is the authoritative list.

It is more complete than the README.

Known variable names include:

- `NODE_ENV`
- `PORT`
- `CORS_ORIGIN`
- `MONGO_URI`
- `ADMIN_EMAIL`
- `ADMIN_PASSWORD`
- `JWT_SECRET`
- `JWT_EXPIRES_IN`
- `JWT_REFRESH_EXPIRES_IN`
- `JWT_REFRESH_COOKIE_MAX_AGE_MS`
- `ENABLE_SWAGGER`
- `CLOUDINARY_CLOUD_NAME`
- `CLOUDINARY_API_KEY`
- `CLOUDINARY_API_SECRET`
- `OBSIDIAN_VAULT_ID`

`infra/config/env.ts` throws at startup if required variables are missing.

Never copy actual environment variable values into:

- `CLAUDE.md`;
- `specs/`;
- documentation;
- agent outputs intended for version control.

---

# Testing Conventions

Unit tests live under:

`test/unit/`

and mirror the `src/` path of the file under test.

Example:

```text
src/infra/repositories/mongo-work.repository.ts
↓
test/unit/infra/repositories/mongo-work.repository.spec.ts
```

When adding a new source file, put its spec at the matching mirrored path.

E2E tests live under:

`test/e2e/*.e2e-spec.ts`

and run under:

`test/jest-e2e.json`

They are not picked up by plain:

`npm test`

The `@/*` path alias maps to:

`src/*`

See:

- `tsconfig.json`
- Jest configs' `moduleNameMapper`

Most existing code uses relative imports, but `@/` is valid and used in
some files.

Repository tests such as:

`mongo-*.repository.spec.ts`

mock Mongoose models directly using `jest.mock(...)`.

They do not hit a real database.

`mongodb-memory-server` is a devDependency but is not wired into the current
unit test suite.

---

# Obsidian Knowledge Base

Long-term engineering knowledge for this project is stored in Obsidian.

The Vault is defined by:

`OBSIDIAN_VAULT_ID`

from the local environment.

Never hardcode the Vault ID here or in another committed file.

It identifies a local, machine-specific Vault.

Project knowledge root:

`CarShop/`

Allowed knowledge directories:

- `CarShop/Architecture/`
- `CarShop/ADR/`
- `CarShop/Patterns/`
- `CarShop/Learnings/`
- `CarShop/Troubleshooting/`

`knowledge-reader` must only read project-relevant knowledge within this scope.

`knowledge-manager` must never write outside this scope.

Notion is the source of truth for tasks and product requirements.

The repository is the source of truth for the current implementation.

Obsidian is the source of historical engineering knowledge.

A historical Obsidian note must never override contradictory evidence from
the current repository without explicit architectural evaluation.

## Agent Environment Isolation

Specialized agents must follow least-privilege access to environment variables.

An agent must not source `.env` merely to obtain one configuration value.

Agents must never load unrelated application secrets into child processes.

For Obsidian agents:

- `knowledge-reader`
- `knowledge-manager`

the only application-external configuration they require is:

`OBSIDIAN_VAULT_ID`

This variable must already be present in the Claude Code process environment.

If it is missing, the Obsidian agent must return `BLOCKED`.

It must not source `.env` or inspect unrelated environment values.