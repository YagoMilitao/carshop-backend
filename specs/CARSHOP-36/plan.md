# CARSHOP-36 — Implementation Plan

## Source

Specification:
`specs/CARSHOP-36/spec.md`

## Architect Verdict

READY FOR IMPLEMENTATION

## Objective

Harden the existing `MONGO_URI`-based Mongoose connection so that:

1. The app fails fast at startup with a non-leaking error when `MONGO_URI`
   is missing or has the wrong scheme (FR-001/002, AC-001/002).
2. Success and failure paths never log/print/return the raw URI or
   embedded credentials, at startup or at runtime (FR-003/004/005/006,
   AC-003/004/005/006, AC-008 preserved).
3. README (and optionally `.env.example`) documents the manual Atlas
   provisioning procedure and the "supply `MONGO_URI` as a provider
   secret, never commit" rule, using only placeholders (FR-007/008,
   AC-007).

Provisioning the real cluster and storing the real secret remain
explicitly out of repository scope.

## Current Architecture

- `src/infra/config/env.ts` reads `MONGO_URI` via `getRequiredEnv`
  (line ~339), which only checks non-empty presence — no scheme/format
  validation exists today. Other production-only strength checks
  (`assertJwtSecretStrength`, `assertProductionCorsOrigins`,
  `assertAdminPasswordPolicy`) already exist as fail-fast helpers in this
  file, following a consistent per-clause validation pattern.
- `src/infra/database/mongoose.ts` (`connectDatabase`) re-checks for an
  empty `mongoUri`, calls `mongoose.connect(mongoUri)`, and on failure
  detects the MongoDB Atlas "IP not allowed" scenario to produce a
  friendlier message (preserved, unchanged). On success it logs a fixed,
  non-sensitive message. On any other (generic) failure it currently does
  `throw error;`, rethrowing the raw driver error unmodified — this is the
  gap that FR-004/AC-004 target.
- `src/main/index.ts` calls `connectDatabase(env.mongoUri)` before
  `createApp()`. On failure it already logs only `error.message` (never
  the full error object or `.cause`) via `console.error`, then
  `process.exit(1)`. No code change required here once env.ts/mongoose.ts
  guarantee sanitized messages.
- `src/infra/presentation/middleware/error-handler.middleware.ts` already
  returns a generic, non-leaking `500` JSON body for unrecognized errors,
  while logging the raw error server-side via `console.error(error)`.
  Existing `test/e2e/security-error-leakage.e2e-spec.ts` already asserts
  the literal substring `MONGO_URI` never appears in a response body.
- README does not currently document any MongoDB Atlas setup process.
  `.env.example` already documents `MONGO_URI` using a placeholder value.

## Existing Knowledge (Obsidian) — Verified Against Repo

- Per-clause validation testing pattern
  (`CarShop/Patterns/testing-or-combined-validation-conditions.md`):
  still valid and directly applicable. `env.ts`'s production checks are
  tested clause-by-clause; the new `MONGO_URI` scheme check should follow
  the same discipline.
- Claim of a prior Neon/Postgres/Prisma proposal: no ADR found;
  irrelevant either way — current repo is unambiguously Mongoose/MongoDB.
  No action needed.
- Claim that `env.ts` only checks presence, not shape: confirmed
  accurate. `getRequiredEnv('MONGO_URI')` (env.ts:339) only checks
  non-empty; no scheme/format validation exists today. This is exactly
  the FR-002 gap to close.
- Claim that a syntactically-valid-but-unreachable `MONGO_URI` causes a
  slow "buffering timeout": not confirmed, likely inaccurate for this
  code path. `mongoose.connect()` rejects once
  `serverSelectionTimeoutMS` elapses; `bufferCommands` affects
  post-connection query buffering, not initial `connect()`. No AC
  requires connection-attempt-speed changes. Not implemented, not raised
  as blocking.
- Existing error-handler +
  `test/e2e/security-error-leakage.e2e-spec.ts` convention: confirmed
  current and directly relevant — new work must conform to, not
  duplicate, this convention.

## Proposed Solution

Add a fail-fast MongoDB URI scheme validator in `env.ts`, wrap the
generic (non-Atlas) connection-failure branch in `mongoose.ts` with a
sanitized error, and document the manual Atlas provisioning + secret
supply procedure in the README (optionally tightening the `.env.example`
comment). No changes are needed in `src/main/index.ts` or
`error-handler.middleware.ts`.

## Technical Decisions

### Decision

`assertMongoUriShape` runs unconditionally, in every `NODE_ENV` (not
production-gated like `assertJwtSecretStrength` /
`assertAdminPasswordPolicy` / `assertProductionCorsOrigins`).

### Reason

AC-001/AC-002 are environment-agnostic; `getRequiredEnv`'s existing
presence check is already unconditional; there is no legitimate dev/test
reason to accept a structurally malformed connection string.

### Alternatives Considered

Gating the check to production only, mirroring the other strength checks
in the file.

### Trade-offs

Unconditional validation strictly tightens validation across all
environments but does not break `.env.example` or existing test fixtures
(all already use `mongodb://`). Flagged as a non-blocking assumption to
confirm during implementation.

---

### Decision

On generic (non-Atlas) connection failure in `mongoose.ts`, replace
`throw error;` with a new sanitized `Error` whose fixed message never
includes driver-internal content, attaching the original error as
`.cause` (not printed anywhere downstream).

### Reason

The generic catch branch's raw driver error `.message` could in
principle include the URI/credentials. Wrapping guarantees FR-004/AC-004
without losing diagnostic value, matching the existing Atlas-branch
precedent of using a friendlier message.

### Alternatives Considered

Pattern-matching/stripping the URI out of the raw message before
rethrowing.

### Trade-offs

Wrapping (never printing the raw message at all) is a stronger guarantee
than partial redaction via pattern matching, at the cost of losing the
original message from the primary error surface (mitigated by attaching
it as `.cause` for potential future diagnostics, never logged).

---

### Decision

No code change to `src/main/index.ts` or
`src/infra/presentation/middleware/error-handler.middleware.ts`.

### Reason

`main/index.ts` already logs only `error.message`, never the full error
object or `.cause` — once `env.ts`/`mongoose.ts` guarantee sanitized
messages, this automatically satisfies FR-001/002/004 and
AC-001/002/004. The error handler's existing generic-500 JSON contract
already satisfies FR-005/AC-005; its `console.error(error)` already
satisfies FR-006/AC-006 in practice because runtime (post-startup)
Mongoose/MongoDB errors do not embed the connection string in
`.message`, verified against
`test/e2e/security-error-leakage.e2e-spec.ts`.

### Alternatives Considered

Proactively adding redaction logic to the shared error-handler
middleware.

### Trade-offs

Avoids unnecessary changes to a shared, cross-cutting middleware. If
tester/developer finds a concrete counterexample where a runtime error
does leak `MONGO_URI` content through this middleware, that must be
escalated back to `architect` before the middleware is touched — it must
not be changed unilaterally.

## Execution Flow

1. Add `assertMongoUriShape` helper to `src/infra/config/env.ts` and wire
   it immediately after the existing `getRequiredEnv('MONGO_URI')` call.
2. Replace the generic-catch `throw error;` in
   `src/infra/database/mongoose.ts`'s `connectDatabase` with a sanitized
   wrapper error carrying `.cause`.
3. Update/add unit tests in `test/unit/infra/config/env.spec.ts` and
   `test/unit/infra/database/mongoose.spec.ts` to match the new behavior.
4. Confirm `test/e2e/security-error-leakage.e2e-spec.ts` still passes
   unchanged (no production-code-driven change expected there).
5. Add the MongoDB Atlas / `MONGO_URI` documentation section to
   `README.md`.
6. Optionally tighten the `.env.example` comment for `MONGO_URI` to
   mention the enforced scheme requirement.

## Files

### Files to Create

None.

### Files to Modify

- `src/infra/config/env.ts` — add `assertMongoUriShape` helper; call it
  after `getRequiredEnv('MONGO_URI')`.
- `src/infra/database/mongoose.ts` — replace generic-catch `throw error;`
  with a sanitized wrapper error (`.cause` preserved). Atlas-branch logic
  unchanged.
- `README.md` — add a new "Banco de Dados (MongoDB Atlas)" section (near
  "Configuração"/"Segurança") documenting the manual provisioning
  procedure and the secret-supply rule, using only placeholders.
- `.env.example` — optional: tighten the `MONGO_URI` comment to mention
  the enforced scheme requirement (documentation only, no behavior
  change).
- `test/unit/infra/config/env.spec.ts` — new describe block for
  `MONGO_URI` shape validation.
- `test/unit/infra/database/mongoose.spec.ts` — update existing tests
  asserting raw-error identity; add new regression test for message
  sanitization.

No changes planned to `src/main/index.ts` or
`src/infra/presentation/middleware/error-handler.middleware.ts` (see
Technical Decisions above for rationale; escalate to `architect` if a
concrete counterexample is found during implementation).

## Contract Impact

None. No HTTP route, status code, request/response schema, header, or
cookie changes. No Swagger fragment changes required.

## Persistence Impact

None. No persistence schema or mapping changes. Mongoose connection
handling behavior changes only in how failures are reported, not in
connection semantics (Atlas IP-allowlist detection, success logging,
`bufferCommands`/timeout behavior all unchanged).

## Security Impact

- Closes a startup-time gap where `MONGO_URI` could be missing/malformed
  without a clear, non-leaking failure (FR-001/002).
- Closes a runtime/startup gap where a raw driver error's `.message`
  could in principle embed the connection string/credentials on generic
  connection failure (FR-004).
- No change to authentication, CORS, CSRF, upload, or cookie handling.
- No new dependency introduced.
- NFR-001 residual risk: sanitization relies on replacing/never-printing
  raw driver messages rather than pattern-matching to strip a URI out of
  them — this is treated as a stronger guarantee than partial redaction.

## Swagger Impact

None. No endpoint, payload, response, status code, authentication
requirement, cookie, or header changes.

## Testing Strategy

`test/unit/infra/config/env.spec.ts` — new describe block for
`MONGO_URI` (FR-001/FR-002, AC-001/AC-002), following the existing
`jest.isolateModules` + `captureEnvLoadError`-style pattern:

- Missing/empty `MONGO_URI` → throws, message contains `MONGO_URI`,
  never contains a URI value.
- `MONGO_URI` without valid scheme (e.g. `not-a-uri`,
  `http://example.com`) → throws, message contains `MONGO_URI`, does not
  contain the invalid input value itself.
- `MONGO_URI=mongodb://...` → loads successfully.
- `MONGO_URI=mongodb+srv://...` → loads successfully.
- Applies in every `NODE_ENV` (at least one case with
  `NODE_ENV=development` or `test` to prove unconditional application).

`test/unit/infra/database/mongoose.spec.ts` — update existing tests +
add new ones (FR-003/FR-004, AC-003/AC-004/AC-008):

- Update `'rethrows unknown connection errors'`: currently asserts
  `rejects.toBe(connectionError)`; change to assert the wrapped
  sanitized error is thrown (fixed message, `.cause === connectionError`),
  and assert the sanitized message never contains the original raw
  message's content.
- Update the four cause-chain-walking tests (`'walks an Error cause
  chain...'`, `'extracts message/cause/reason...'`, `'skips a
  candidate...'`, `'does not loop forever when cyclic'`) similarly —
  currently assert `rejects.toBe(mainError)`; update to check the
  wrapped error's fixed message and `.cause` linkage.
- Add explicit NFR-001/FR-004 regression test: reject `connect()` with a
  synthetic, obviously-fake error whose message looks like it embeds a
  connection string with credentials (e.g. a clearly fictitious
  `<REDACTED-CONNECTION-STRING-WITH-FAKE-CREDENTIALS>` placeholder shaped
  like a MongoDB URI — never a real value, and never written in this
  document in a form that looks like an actual connection string) and
  assert the thrown wrapper's `.message` does not contain that
  substring.
- `'connects and logs success message'` and the Atlas-branch test remain
  unchanged (regression coverage for AC-003/AC-008/NFR-004).

`test/e2e/security-error-leakage.e2e-spec.ts` — no production-code-driven
change expected; tester should confirm existing coverage (already checks
for the `MONGO_URI` substring) still passes; may add one additional case
if a concrete runtime leak vector is identified.

Coverage target: `env.ts` and `mongoose.ts` are small, fully
synthetic/mockable, dependency-injectable modules. Both new code paths
(`assertMongoUriShape`, generic-wrap catch branch) are trivially
unit-testable without network/DB access, so the `>= 80%` new/changed-code
target is expected to be met directly — no justified-exception rationale
anticipated. README/`.env.example` changes are documentation-only and
excluded from coverage measurement per the rule's scope (`src/**/*.ts`),
per `.claude/rules/testing.md`.

## Risks

- Breaking change to `mongoose.ts`'s thrown-error identity for the
  generic (non-Atlas) failure branch is intentional and spec-mandated
  (FR-004), not a regression; the only caller (`main/index.ts`) only
  reads `.message`, so real bootstrap behavior (exit 1, log a message) is
  preserved — only the content of that message changes. Existing unit
  tests asserting raw-error identity must be updated in the same change.
- NFR-001 residual risk: sanitization relies on replacing/never-printing
  raw driver messages rather than pattern-matching to strip a URI out of
  them; this is a stronger guarantee than partial redaction.
- Network access (IP allowlist) configured too broadly on the Atlas side
  would widen the attack surface; this is a manual operator
  responsibility documented under FR-007 but not enforceable from code.
- If redaction logic is incomplete, a future driver upgrade or unusual
  error shape could still leak `MONGO_URI` contents into logs; this risk
  is mitigated by the redaction/sanitization behavior required in FR-004
  and FR-006 and verified by AC-004 and AC-006.
- No security-sensitive surface (auth, CORS, CSRF, upload, cookies) is
  touched. No new dependency, no schema change, no route change —
  architecture direction preserved; all changes stay within
  `src/infra/config` and `src/infra/database`.

## Implementation Steps

1. Add `assertMongoUriShape(mongoUri: string): void` to
   `src/infra/config/env.ts`, following the existing style
   (`assertJwtSecretStrength`, `assertProductionCorsOrigins`):

   ```
   function assertMongoUriShape(mongoUri: string): void {
     if (!/^mongodb(\+srv)?:\/\//.test(mongoUri)) {
       throw new Error(
         'A variável "MONGO_URI" precisa ser uma connection string MongoDB válida (iniciando com "mongodb://" ou "mongodb+srv://").',
       );
     }
   }
   ```

   Wire it right after the existing
   `const mongoUri = getRequiredEnv('MONGO_URI');` line:

   ```
   const mongoUri = getRequiredEnv('MONGO_URI');
   assertMongoUriShape(mongoUri);
   ```

   The error message intentionally names only the variable, never
   `mongoUri`'s value — same pattern as every other helper in this file
   (NFR-001/AC-002). Runs unconditionally across all `NODE_ENV` values
   (see Technical Decisions).

2. In `src/infra/database/mongoose.ts`, in the generic (non-Atlas) catch
   branch of `connectDatabase`, replace `throw error;` with:

   ```
   const genericConnectionError = new Error(
     'Não foi possível conectar ao MongoDB. Verifique a configuração de MONGO_URI e a conectividade com o servidor.',
   );
   (genericConnectionError as Error & { cause?: unknown }).cause = error;
   throw genericConnectionError;
   ```

   The Atlas-IP-not-allowed branch stays unchanged (preserves
   AC-008/NFR-004). Do not add any new `console.*` calls in this file. No
   changes to `connectDatabase`'s empty-URI check, `disconnectDatabase`,
   or the Atlas-hint detection/cause-chain-walking helpers
   (`normalizeErrorMessage`, `extractMessage`, `extractNextCandidates`,
   `isAtlasIpNotAllowedError`) — only the branch they feed into
   afterward changes what gets thrown.

3. Update/add unit tests per the Testing Strategy section above.

4. Add the `## Banco de Dados (MongoDB Atlas)` section to `README.md`
   (near "Configuração"/"Segurança"), provider-agnostically and with
   only fictitious placeholders (per `.claude/rules/spec-security.md`),
   covering:
   - Creating/selecting an Atlas cluster and database.
   - Creating a database user with least-privilege access appropriate
     for this app (read/write on the app's database only).
   - Restricting Network Access (IP allowlist) to the necessary sources.
   - Obtaining the resulting connection string (placeholder shape only,
     e.g.
     `mongodb+srv://<DB_USER>:<DB_PASSWORD>@<CLUSTER_HOST>/<DATABASE_NAME>`).
   - The rule that `MONGO_URI` must be supplied exclusively as a secret
     through the hosting/deployment provider's environment configuration
     mechanism — never committed, never hardcoded in source.
   - The now-enforced format requirement (`mongodb://` or
     `mongodb+srv://`), so operators understand why startup fails
     otherwise.

   No specific hosting provider is named anywhere in the current
   repo/README, so the doc stays fully provider-agnostic.

5. Optional: tighten the `.env.example` comment for `MONGO_URI` to
   mention the enforced scheme requirement, mirroring existing comment
   style. Documentation only, no behavior change (already compliant with
   the `<DATABASE_URL>` placeholder).

## Definition of Done Mapping

| Requirement | Implementation | Verification |
| --- | --- | --- |
| FR-001 / AC-001 | `getRequiredEnv('MONGO_URI')` (existing) | `env.spec.ts` new describe block |
| FR-002 / AC-002 | `assertMongoUriShape` in `env.ts` | `env.spec.ts` new describe block |
| FR-003 / AC-003 | Existing success-log path in `mongoose.ts` (unchanged) | `mongoose.spec.ts` existing test, unchanged |
| FR-004 / AC-004 / AC-008 | Sanitized wrapper error in `mongoose.ts` generic catch branch; Atlas branch unchanged | `mongoose.spec.ts` updated tests + new regression test |
| FR-005 / AC-005 | Existing generic-500 contract in `error-handler.middleware.ts` (no change) | Existing `security-error-leakage.e2e-spec.ts` |
| FR-006 / AC-006 | Existing `console.error(error)` server-side logging in `error-handler.middleware.ts` (no change) | Existing `security-error-leakage.e2e-spec.ts` |
| FR-007 / FR-008 / AC-007 | New README section | Manual review of README content (placeholders only) |
| NFR-001 | Sanitized error wrapping + variable-name-only messages | `env.spec.ts` + `mongoose.spec.ts` assertions on message content |
| NFR-002 | Fail-fast before HTTP listener starts (existing `main/index.ts` flow, unchanged) | `env.spec.ts` |
| NFR-003 | Follows existing helper/pattern style in `env.ts` and `mongoose.ts` | Code review |
| NFR-004 | Atlas branch and generic-500 contract preserved unchanged | `mongoose.spec.ts` unchanged tests; e2e leakage spec |

## Open Non-Blocking Questions

1. `assertMongoUriShape` applies unconditionally across all `NODE_ENV`
   values (not gated to production only) — confirm during
   implementation.
2. No connection-attempt timeout tuning is introduced; the "slow
   buffering timeout" Obsidian claim is not confirmed and is outside
   this spec's AC-* set.
3. No code change to `error-handler.middleware.ts`; AC-005/AC-006
   satisfied by the existing generic-500 + existing
   `console.error(error)` convention. If developer/tester finds a
   concrete counterexample, escalate to `architect` before touching this
   shared middleware.
4. Whether the hosting/deployment provider for production is already
   decided (e.g. a specific PaaS) is not confirmed in the source task;
   the README documentation (FR-007/FR-008) should stay
   provider-agnostic unless the repository already implies a specific
   provider.
</content>
