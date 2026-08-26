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
@.claude/rules/branching.md

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

# Branch Naming Validation

Every work branch must follow the mandatory pattern
`<tipo>/CARSHOP-<numero>[-<descricao-curta>]`, where `<tipo>` and
`CARSHOP-<numero>` are mandatory and the description suffix is optional;
the full placeholder definitions, the type taxonomy, the examples, and
the exception list are defined in `.claude/rules/branching.md`. The coordinator validates the
current branch name against that convention at two checkpoints: before
invoking `developer` (Phase 7 entry) and before invoking `task-manager`
(Phase 11 entry). On a mismatch that is not a documented exception, the
coordinator reports the expected pattern and blocks the corresponding
invocation, and must never auto-rename, auto-recreate, or auto-push a
branch to fix it. After
classifying a task, the coordinator should also suggest a `<tipo>` for
the branch based on the task's nature (see "Suggested Type (Non-Binding)"
in `.claude/rules/branching.md`) — this is informational only and never
enforced or acted upon automatically.

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

# Canonical Workflow

All implementation work associated with a `CARSHOP-{number}` task must enter
through the canonical workflow defined in this section.

The workflow always begins with:

`task-reader`

After requirements retrieval, the coordinator must classify the task as:

- `TRIVIAL`
- `SMALL`
- `NON-TRIVIAL`

The selected route is determined exclusively by the complexity classification
rules defined below.

Agents must not invent alternative routes.

No other section of this document may define a conflicting workflow.

The coordinator owns task classification and workflow routing.

Do not create a dedicated agent solely for complexity classification.

# Workflow Complexity Classification

After `task-reader` successfully retrieves the task, the coordinator must
classify the implementation before invoking additional implementation agents.

The coordinator must return exactly one classification:

`TRIVIAL`

`SMALL`

`NON-TRIVIAL`

Classification must be based on:

- requirements retrieved from Notion;
- Definition of Done;
- explicit constraints;
- known task scope.

Do not classify based solely on task title.

# Workflow Reclassification

Classification may escalate when new evidence reveals greater complexity.

Allowed escalation:

```text
TRIVIAL
    ↓
SMALL
    ↓
NON-TRIVIAL
```

## Conservative Classification

When uncertain between:

`TRIVIAL` and `SMALL`

choose:

`SMALL`

When uncertain between:

`SMALL` and `NON-TRIVIAL`

choose:

`NON-TRIVIAL`

Never downgrade task complexity merely to reduce execution time.

## TRIVIAL

Classify as `TRIVIAL` only when the change has no meaningful architectural,
behavioral, persistence, security or contract impact.

Typical examples:

- typo correction;
- copy/text change;
- formatting-only adjustment;
- documentation-only correction;
- obvious local rename with no behavioral impact;
- simple constant or label adjustment whose expected behavior is unambiguous.

A task is NOT TRIVIAL if it changes:

- business rules;
- API behavior;
- persistence;
- authentication;
- authorization;
- security;
- integrations;
- dependencies;
- shared abstractions;
- architecture.

### TRIVIAL Route

```text
task-reader
    ↓
classification: TRIVIAL
    ↓
developer
    ↓
reviewer
    ↓
task-manager
```
## SMALL

Classify as `SMALL` when behavior changes but the implementation remains
localized, straightforward and does not require an architectural decision.

A SMALL task:

- has clear requirements;
- has limited implementation scope;
- does not alter architecture;
- does not alter persistence design;
- does not alter authentication or authorization;
- does not introduce security-sensitive behavior;
- does not introduce a new external integration;
- does not introduce a new dependency;
- does not materially change a public API contract;
- does not require changing shared architectural boundaries.

Examples may include:

- localized validation changes;
- isolated behavior adjustments;
- small endpoint behavior corrections without contract redesign;
- localized UI/backend behavior with clear existing patterns;
- simple bug fixes where root cause and expected behavior are well-defined.

### SMALL Route

```text
task-reader
    ↓
classification: SMALL
    ↓
spec-writer
    ↓
developer
    ↓
tester
    ↓
reviewer
    ↓
quality gate
    ↓
task-manager
```

## NON-TRIVIAL

Classify as `NON-TRIVIAL` when any meaningful technical decision or
cross-cutting impact exists.

Use `NON-TRIVIAL` when the task affects one or more of:

- architecture;
- module boundaries;
- shared abstractions;
- authentication;
- authorization;
- security;
- persistence design;
- data migration;
- public API contracts;
- external integrations;
- infrastructure;
- dependency introduction or replacement;
- shared middleware;
- cross-cutting behavior;
- multiple architectural layers;
- significant ambiguity in implementation requirements.

### NON-TRIVIAL Route

```text
task-reader
    ↓
classification: NON-TRIVIAL
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
          ↓
     task-manager
          ↓
  knowledge-manager
```

## Workflow Authority

The workflow defined in this section is the single canonical workflow for
all `CARSHOP-{number}` implementation tasks.

The canonical workflow contains three official routes:

- `TRIVIAL`
- `SMALL`
- `NON-TRIVIAL`

The coordinator must select exactly one route using the complexity
classification rules defined above.

No other section may define a conflicting workflow or reorder the stages
of an official route.

The phase descriptions below describe stages that may apply to one or more
routes. They do not imply that every stage runs for every classification.

A stage must be executed only when required by the selected route.

Conditional and route-specific behavior is defined explicitly in each phase.

If any later instruction conflicts with the selected canonical route,
the canonical route takes precedence.
---


# Specification Gate

A versioned specification is mandatory for:

- `SMALL`;
- `NON-TRIVIAL`;

CARSHOP implementation tasks.

Expected location:

`specs/CARSHOP-{number}/spec.md`

A specification is not required for `TRIVIAL` changes.

The specification defines WHAT must be achieved.

Implementation decisions define HOW it will be achieved.

For NON-TRIVIAL tasks, the architect owns HOW.

For SMALL tasks, the developer may choose implementation details as long as
they remain within:

- the specification;
- existing architecture;
- existing project conventions.

Never modify the specification merely to:

- simplify implementation;
- accommodate an implementation mistake;
- make failing tests pass.

If implementation reveals an actual requirement problem:

STOP.

Return control to the coordinator.
---

# Phase 1 — Requirements Retrieval

Every `CARSHOP-{number}` implementation workflow begins with `task-reader`.

The task-reader must retrieve the task from Notion and return structured
requirements.

Do not ask the user to manually copy requirements that can be obtained
through the configured Notion integration.

If task-reader reports:

`BLOCKING`

STOP.

Do not classify or implement the task.
Do not invoke `spec-writer`.

---

# Phase 2 — Complexity Routing

After successful requirements retrieval, the coordinator must classify the
task according to the Workflow Complexity Classification rules.

Return exactly:

`TRIVIAL`

or

`SMALL`

or

`NON-TRIVIAL`

Then execute only the corresponding canonical route.

Do not execute agents belonging exclusively to a more expensive route unless
new evidence requires reclassification.

# Phase 3 — Specification

Invoke `spec-writer` only for:

- SMALL;
- NON-TRIVIAL;

tasks.

Do not invoke `spec-writer` for TRIVIAL work.

Pass the complete task-reader output.

The spec-writer must create or update:

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

# Phase 4 — Knowledge Retrieval
This phase applies only to `NON-TRIVIAL` tasks.

Even for NON-TRIVIAL tasks, `knowledge-reader` is conditional.

Invoke it only when historical engineering knowledge may materially
influence the solution, including:

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

Search Obsidian by technical concepts, not only by task ID.

Pass relevant historical knowledge to `architect`.

Skip this phase when no relevant historical decision is likely to affect
the task.

Obsidian is historical context.

The repository remains the source of truth for current implementation.
---

# Phase 5 — Architecture
Invoke `architect` only for `NON-TRIVIAL` tasks.
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

SMALL tasks do not invoke architect by default.

TRIVIAL tasks do not invoke architect.
Do not invoke `developer`.

---
# Phase 6 — Plan Persistence
This phase applies only to `NON-TRIVIAL` tasks.

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
Implementation must not begin for NON-TRIVIAL work until plan persistence
succeeds.

If plan persistence fails:

`STOP`

Do not invoke `developer`.

# Phase 7 — Implementation

Invoke `developer` according to the selected workflow route.

Before invoking `developer`, the coordinator must have already checked
the current branch name against `.claude/rules/branching.md` and, on a
mismatch that is not a documented exception (see the Exceptions list in
`.claude/rules/branching.md`), obtained explicit user authorization to
proceed.

## TRIVIAL Input

Pass:

- original task ID;
- task-reader requirements;
- classification `TRIVIAL`.

A specification and architectural plan are not required.

The developer must keep the implementation strictly within the trivial
scope.

If meaningful behavioral or architectural complexity is discovered:

`STOP`

Return control to the coordinator for reclassification.

## SMALL Input

Pass:

- original task ID;
- task-reader requirements;
- `specs/CARSHOP-{number}/spec.md`;
- classification `SMALL`.

An architectural plan is not required by default.

The developer may make localized implementation decisions only when they:

- comply with the specification;
- follow existing repository patterns;
- do not alter architecture;
- do not introduce persistence, security, integration or contract changes.

If one of those conditions cannot be maintained:

`STOP`

Return control to the coordinator and reclassify as `NON-TRIVIAL`.

## NON-TRIVIAL Input

Pass:

- original task ID;
- task-reader requirements;
- `specs/CARSHOP-{number}/spec.md`;
- `specs/CARSHOP-{number}/plan.md`;
- classification `NON-TRIVIAL`;
- architect verdict `READY FOR IMPLEMENTATION`;
- relevant historical knowledge when it materially affects implementation.

The developer must follow the approved versioned plan.

## Common Implementation Rules

The developer must:

- preserve unrelated existing changes;
- not reinterpret product requirements;
- not silently change the specification;
- not commit;
- not push.

If a mandatory input for the selected route is unavailable:

`STOP`

Return:

`BLOCKED`

---

# Phase 8 — Testing

Testing behavior depends on workflow classification.

## TRIVIAL

Do not invoke `tester` by default.

The developer may perform focused validation proportional to the change.

If systematic behavioral testing becomes necessary:

`STOP`

Return to the coordinator and reclassify the task as `SMALL`.

## SMALL

Invoke `tester`.

Pass:

- original task ID;
- versioned specification;
- developer implementation summary;
- current diff.

## NON-TRIVIAL

Invoke `tester`.

Pass:

- original task ID;
- versioned specification;
- architecture plan;
- developer implementation summary;
- current diff.

## Tester Responsibilities

For SMALL and NON-TRIVIAL tasks, the tester must map validation to the
specification's acceptance criteria.

When IDs such as these exist:

- `FR-*`
- `NFR-*`
- `AC-*`

use them for traceability.

Example:

```text
AC-001 → PASS
AC-002 → PASS
AC-003 → NOT VERIFIED
```
---

# Phase 9 — Review

Invoke `reviewer` for all workflow classifications.

## TRIVIAL

Pass:

- original task ID;
- task-reader requirements;
- implementation;
- current diff.

Review only:

- correctness of the requested change;
- accidental unrelated changes;
- obvious regressions;
- sensitive-information exposure.

Do not perform unnecessary broad architectural analysis.

## SMALL

Pass:

- original task ID;
- versioned specification;
- implementation;
- tester results;
- current diff.

Review:

- specification compliance;
- correctness;
- regressions;
- test coverage;
- scope creep;
- security implications when applicable.

## NON-TRIVIAL

Pass:

- original task ID;
- versioned specification;
- architecture plan;
- implementation;
- tester results;
- current diff.

Perform the complete independent review, including architecture,
persistence, contracts and security.

---

# Phase 10 — Completion and Quality Gates

Apply the gate corresponding to the selected workflow route.

## TRIVIAL Completion Gate

TRIVIAL work passes when:

- the requested change is implemented;
- reviewer completed the focused review;
- no `BLOCKER` remains open;
- no `HIGH` remains open;
- no sensitive-information exposure remains unresolved.

A tester result and versioned specification are not required.

## SMALL Quality Gate

SMALL work passes when:

- implementation is complete;
- required validation was executed;
- specification acceptance criteria are satisfied;
- reviewer completed independent review;
- the `>= 80%` new/changed-code unit-test coverage target defined in
  `.claude/rules/testing.md` is met, or a documented justified exception is
  recorded (percentage obtained, uncovered parts, reason, residual risk);
- no `BLOCKER` remains open;
- no `HIGH` remains open;
- no unresolved specification violation prevents acceptance;
- no sensitive-information exposure remains unresolved.

## NON-TRIVIAL Quality Gate

NON-TRIVIAL work passes when:

- implementation is complete;
- approved architecture plan was followed;
- required validation was executed;
- specification acceptance criteria are satisfied;
- reviewer completed full independent review;
- the `>= 80%` new/changed-code unit-test coverage target defined in
  `.claude/rules/testing.md` is met, or a documented justified exception is
  recorded (percentage obtained, uncovered parts, reason, residual risk);
- no `BLOCKER` remains open;
- no `HIGH` remains open;
- no unresolved specification violation prevents acceptance;
- no sensitive-information exposure remains unresolved.

## Failure

If the applicable gate fails:

Do not invoke `task-manager` for completion.

For TRIVIAL:

```text
developer
    ↓
reviewer
    ↓
completion gate
```

---

# Phase 11 — Task Completion

Only after the applicable completion or quality gate passes may
`task-manager` be invoked.

The coordinator must re-check the current branch name against
`.claude/rules/branching.md` and must not invoke `task-manager` if the
branch is out of pattern, is not a documented exception (see the
Exceptions list in `.claude/rules/branching.md`), and the mismatch has
not been authorized by the user.

## TRIVIAL

Pass:

- task ID;
- original task-reader requirements;
- classification;
- developer implementation summary;
- reviewer verdict;
- completion gate result.

## SMALL

Pass:

- task ID;
- original task-reader requirements;
- versioned specification;
- classification;
- developer implementation summary;
- tester validation results;
- reviewer verdict;
- quality gate result.

## NON-TRIVIAL

Pass:

- task ID;
- original task-reader requirements;
- versioned specification;
- architecture plan;
- classification;
- developer implementation summary;
- tester validation results;
- reviewer verdict;
- quality gate result.

The task-manager may update the Notion task to `Done` and record a concise
technical completion summary.

The task-manager must never fabricate implementation, testing or review
evidence.

The task-manager must never change product requirements or planning
properties unless explicitly requested by the user.

If the applicable gate does not pass:

`DO NOT invoke task-manager for completion.`

---

# Phase 12 — Knowledge Evaluation

Automatic knowledge evaluation depends on workflow classification.

## TRIVIAL

Do not invoke `knowledge-manager`.

TRIVIAL changes are not expected to produce reusable engineering knowledge.

## SMALL

Do not invoke `knowledge-manager` by default.

A SMALL task may invoke `knowledge-manager` only when the coordinator
identifies a clearly reusable:

- engineering pattern;
- meaningful technical learning;
- non-obvious troubleshooting discovery;
- technical decision that will materially affect future work.

Do not invoke knowledge-manager merely to obtain:

`NO KNOWLEDGE TO RECORD`

## NON-TRIVIAL

After:

1. the quality gate passes; and
2. `task-manager` successfully completes;

invoke `knowledge-manager`.

Pass:

- task ID;
- versioned specification;
- architect decisions;
- architecture plan;
- developer implementation summary;
- tester results;
- reviewer verdict.

The knowledge-manager must determine whether reusable engineering knowledge
was produced.

It must not create a note merely because a task was completed.

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

## Unit-Test Coverage Policy

New or changed production code introduced by a task is expected to carry
`>= 80%` unit-test coverage.

This expectation is evaluated against the new/changed code produced by
that task ("new code" / "change coverage"), not the repository's
historical or global coverage number.

The exact target, measurement method (including how added vs. modified
files are approximated using `coverage/lcov.info`), and the justified
exception criteria are defined in `.claude/rules/testing.md`. That rule
file is the single normative source for the threshold and its
measurement; do not restate a different number here.

E2E/integration tests do not automatically substitute for unit tests when
the behavior in question is reasonably unit-testable. E2E coverage and
unit coverage are tracked separately; passing E2E tests alone does not
satisfy the unit-coverage expectation above.

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

# Workflow Timing

The coordinator must record the start and end time of every workflow stage.

For each invoked agent or gate, record:

- stage name;
- start timestamp;
- end timestamp;
- elapsed time;
- final status.

Do not expose hidden chain-of-thought or internal reasoning.

Only report operational timing and stage outcome.

Example stages:

- task-reader
- complexity classification
- spec-writer
- knowledge-reader
- architect
- plan-writer
- developer
- tester
- reviewer
- quality gate
- task-manager
- knowledge-manager

Skipped conditional stages must be reported as:

`SKIPPED`

At the end of the workflow, always print a timing summary.

Example:

| Stage | Status | Duration |
| --- | --- | ---: |
| task-reader | PASS | 12s |
| spec-writer | PASS | 21s |
| knowledge-reader | SKIPPED | — |
| architect | PASS | 48s |
| plan-writer | PASS | 7s |
| developer | PASS | 4m 32s |
| tester | PASS | 1m 14s |
| reviewer | PASS | 54s |
| quality gate | PASS | 2s |
| task-manager | PASS | 8s |
| knowledge-manager | SKIPPED | — |

Then report:

Total workflow time: 7m 18s

Slowest stage:
developer — 4m 32s

Workflow classification:
SMALL

Agents invoked:
6

Agents skipped:
4

## Timing Accuracy

Use real timestamps observed during execution.

Do not estimate durations from memory.

If exact timing cannot be determined for a stage, report:

`UNKNOWN`

Never fabricate timing data.

## Workflow Performance Signal

At the end of the workflow, identify any stage that consumed more than 50%
of the total workflow time.

Report it as:

`PERFORMANCE HOTSPOT`

This is informational only and must not change implementation behavior.