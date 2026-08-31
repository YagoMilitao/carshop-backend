# CARSHOP-106 — Implementation Plan

## Source

Specification:
`specs/CARSHOP-106/spec.md`

## Architect Verdict

READY FOR IMPLEMENTATION

## Objective

Add a dependency-vulnerability gate to `.github/workflows/sonar-backend.yml`
that (a) fails CI on high/critical production-dependency advisories, (b)
surfaces moderate/low findings without failing the build, (c) is backed by
a written triage/tracking policy and a documented exception procedure, (d)
is complemented by an automated update mechanism (Dependabot), and (e)
starts green on `master` by fixing the residual `ip-address` (via
`express-rate-limit`) advisory in `package-lock.json`. Maps to spec.md
FR-001..FR-012 / AC-001..AC-009.

## Current Architecture

- `.github/workflows/sonar-backend.yml`: single job `test-and-sonar` —
  `checkout` (SHA-pinned) → `setup-node` (SHA-pinned, Node 20,
  `cache: npm`) → `npm ci` → `npm run test:coverage -- --runInBand` →
  SonarCloud scan (`SonarSource/sonarqube-scan-action@v7.1.0`, not
  SHA-pinned) → Quality Gate check (SHA-pinned).
  `permissions: contents: read, pull-requests: read`. Triggers:
  `pull_request` and `push` to `main`/`master`.
- No `.github/dependabot.yml` exists.
- `docs/sonar-quality-gate.md` is the established convention for
  CI-related policy docs: flat file directly under `docs/`, Portuguese
  prose.
- `package.json` declares `"express-rate-limit": "^8.3.2"` (range
  unchanged, non-breaking bump available within it).
- `package-lock.json` currently resolves `express-rate-limit@8.3.2`
  pinning `ip-address@10.1.0` exactly — the vulnerable version. A newer
  `8.7.0` (declares `ip-address: ^10.2.0`) satisfies the existing
  `^8.3.2` range, so `npm audit fix` / `npm update express-rate-limit`
  is sufficient — no `package.json` range/major change needed.
- IMPORTANT: `package-lock.json` in the working tree may already have
  uncommitted local modifications from prior investigation — developer
  must run `git diff -- package-lock.json` first before applying the
  FR-012 fix, to avoid clobbering or duplicating in-progress state.
- Jest `collectCoverageFrom: src/**/*.ts` — this task introduces no
  `src/**/*.ts` changes.

## Proposed Solution

**1. CI workflow (`.github/workflows/sonar-backend.yml`)** — add two new
steps between `npm ci` and the test step:

- Step "Dependency audit report (all severities)" — non-failing, for
  visibility: `npm audit --omit=dev --json > audit-report.json || true`;
  also human-readable output appended to `$GITHUB_STEP_SUMMARY`; upload
  `audit-report.json` via `actions/upload-artifact` pinned by commit SHA
  with an explicit `retention-days` (e.g. 14). Use shell `|| true` (not
  `continue-on-error: true`) so it shows as a clean success, not a
  neutral/failed state.
- Step "Dependency vulnerability gate (high/critical, production)" — the
  real gate, no suppression: `npm audit --omit=dev --audit-level=high`.
- No change to `npm ci` (already reproducible/lockfile-exact).
- No `permissions:` block change. Only the new `upload-artifact` action
  reference is SHA-pinned; the pre-existing unpinned
  `SonarSource/sonarqube-scan-action@v7.1.0` is out of scope, do not
  touch it.
- Test-coverage and SonarCloud steps: unchanged commands/env/secrets,
  just moved after the two new steps.

**2. Moderate-vulnerability policy + tracking, and exception procedure**
— new file `docs/dependency-vulnerability-policy.md`, matching
`docs/sonar-quality-gate.md`'s convention (flat file under `docs/`, same
prose style/language, Portuguese). Sections:

- "What the CI gate does" — mirrors the new workflow steps, links to
  the `audit-report.json` artifact.
- "Moderate-severity policy" — moderate findings never fail the build
  automatically; must be triaged by a named owner (the project's
  admin/maintainer); tracked via a table whenever a moderate finding
  first appears in master's audit report.
- "Exception procedure" — a single Markdown table (shared for
  moderate-tracking and high/critical exceptions, differentiated by a
  Severity/Type column) with mandatory columns: Package, Advisory ID,
  Severity, Found Date, Owner, Justification, Residual Risk, Status,
  Expiration/Review Date.
- "How an exception is applied" — explicit design decision: plain
  `npm audit` has no native per-advisory suppression flag. Rather than
  add a new SCA/allowlist tool just for the rare exception case, the
  mechanism is process-based: the gate keeps failing/reporting the
  advisory on every run (never silently muted at the tool level); an
  approved, time-boxed exception is applied by a maintainer via an
  explicit, visible, per-PR merge decision, documented in the tracking
  table, re-reviewed at its expiration date. Weaker automation,
  stronger transparency — called out explicitly in the doc.

**3. Dependabot** — new `.github/dependabot.yml`:

```yaml
version: 2
updates:
  - package-ecosystem: "npm"
    directory: "/"
    schedule:
      interval: "weekly"
    open-pull-requests-limit: 10
```

Optional (developer's call, low-risk enhancement, not mandatory): also
add a `github-actions` ecosystem entry to keep the workflow's pinned
SHAs current.

**4. FR-012 prerequisite fix** — keep `package.json`'s
`"express-rate-limit": "^8.3.2"` unchanged; regenerate
`package-lock.json` via `npm audit fix --omit=dev` (or
`npm update express-rate-limit`) so it resolves a non-vulnerable
`ip-address` (>=10.2.0) within the existing range. Developer must: (a)
inspect `git diff -- package-lock.json` first, (b) after the change run
`npm audit --omit=dev --audit-level=high` (expect pass), `npm run
build`, `npm test`, `npm run test:e2e` (touches
`src/infra/presentation/middleware/rate-limit.middleware.ts`), (c)
review the lockfile diff to confirm no unrelated package changed.

## Technical Decisions

### Decision

Implement the high/critical gate as a dedicated, non-suppressed
`npm audit --omit=dev --audit-level=high` step, placed after `npm ci`
and before the existing test/SonarCloud steps.

### Reason

Reuses the platform-native `npm audit` tooling already available (no new
dependency), operates on the exact lockfile-resolved tree (reproducible,
consistent with NFR-001/NFR-002), and a non-zero exit naturally fails the
CI job per FR-004/AC-001.

### Alternatives Considered

Third-party SCA/allowlist tooling for per-advisory suppression was
considered for the exception mechanism but rejected as disproportionate
for this task's scope (see "How an exception is applied" decision below).

### Trade-offs

The exception mechanism is process-based rather than tool-enforced: it
depends on a maintainer explicitly approving and time-boxing an
exception via documentation and merge decision, not an automated
allowlist. This is a deliberate trade-off of weaker automation for
stronger transparency.

### Decision

Add a separate, non-failing "Dependency audit report (all severities)"
step (`npm audit --omit=dev --json > audit-report.json || true`) before
the failing gate step, with output also appended to
`$GITHUB_STEP_SUMMARY` and the JSON uploaded as a SHA-pinned
`actions/upload-artifact` artifact with `retention-days: 14`.

### Reason

Satisfies FR-006/FR-007/AC-003/AC-004: moderate/low findings must remain
visible and inspectable without blocking the build. Using shell `|| true`
(not `continue-on-error: true`) keeps the step reporting a clean success
status rather than a neutral/failed one.

### Alternatives Considered

`continue-on-error: true` was considered but rejected because it would
render the step as neutral/failed in the UI rather than a clean pass.

### Trade-offs

Bounded artifact retention (14 days) avoids storage growth but means
older reports are not retained long-term; the moderate-vulnerability
tracking table in the policy doc is the durable record, not the
artifact itself.

### Decision

Add `.github/dependabot.yml` targeting the `npm` ecosystem at the repo
root with a weekly schedule.

### Reason

Satisfies FR-008/AC-005 with the platform-native automated
dependency-update mechanism, requiring no new tooling or credentials.

### Alternatives Considered

Adding a `github-actions` ecosystem entry as well was considered; left
as an optional, non-mandatory addition at the developer's discretion.

### Trade-offs

An automated PR mechanism may generate more PRs than can be reviewed
promptly; this is an accepted operational trade-off already called out
in spec.md's Risks section, not a blocking concern.

### Decision

Fix FR-012 by regenerating `package-lock.json` only (via
`npm audit fix --omit=dev` or `npm update express-rate-limit`), without
changing the `package.json` semver range for `express-rate-limit`.

### Reason

The existing `^8.3.2` range already permits `8.7.0`, which declares
`ip-address: ^10.2.0` (non-vulnerable). A lockfile-only regeneration is
sufficient, non-breaking, and avoids an unrelated major-version bump per
spec.md's Constraints section.

### Alternatives Considered

Bumping the `package.json` range or the vulnerable transitive
`ip-address` dependency directly (npm overrides) was not necessary given
the existing range already resolves a fixed version.

### Trade-offs

None significant; this is a narrowly-scoped lockfile regeneration.

## Execution Flow

1. Inspect `git diff -- package-lock.json` for pre-existing uncommitted
   modifications before touching the lockfile.
2. Apply the FR-012 fix (`npm audit fix --omit=dev` or
   `npm update express-rate-limit`); confirm only `express-rate-limit`/
   `ip-address`-related entries changed.
3. Validate locally: `npm audit --omit=dev --audit-level=high` (expect
   pass), `npm run build`, `npm test`, `npm run test:e2e`.
4. Add the two new steps to `.github/workflows/sonar-backend.yml`
   (report step, then gate step) between `npm ci` and the test-coverage
   step; leave test/SonarCloud steps otherwise unchanged.
5. Create `.github/dependabot.yml`.
6. Create `docs/dependency-vulnerability-policy.md` with the four
   documented sections.
7. Observe an actual GitHub Actions run (e.g. a draft PR) to confirm
   step ordering, gate behavior, artifact upload, and that AC-007 (test
   + Sonar still run) holds.

## Files

### Files to Create

- `.github/dependabot.yml`
- `docs/dependency-vulnerability-policy.md`

### Files to Modify

- `.github/workflows/sonar-backend.yml` — two new steps + reordering
  only.
- `package-lock.json` — regenerated for `express-rate-limit`/
  `ip-address` only.

`package.json` is unchanged. No `src/**` changes.

## Contract Impact

None. No `src/**` changes; zero HTTP contract impact.

## Persistence Impact

None.

## Security Impact

- No `permissions:` block change to the workflow.
- Only the new `upload-artifact` action reference is SHA-pinned; the
  pre-existing unpinned `SonarSource/sonarqube-scan-action@v7.1.0` is
  out of scope and not modified.
- No secrets, credentials, tokens, or real environment values
  introduced into any version-controlled file.
- Resolves a known high-severity `ip-address` transitive vulnerability
  (via `express-rate-limit`) in `package-lock.json`.
- Adds a CI gate that fails the build on high/critical production
  dependency advisories going forward.

## Swagger Impact

None. No endpoint, payload, response, status code, authentication
requirement, cookie, or header changes.

## Testing Strategy

No `src/**/*.ts` changes — the >=80% new/changed unit-coverage target
(.claude/rules/testing.md) is not applicable (justified exception: pure
config/CI/doc changes, no custom src logic). Residual risk: low,
mitigated by local command validation, observing an actual GitHub
Actions run (e.g. draft PR) to confirm step ordering/gate
behavior/artifact upload/AC-007 (test+Sonar still run), and full local
regression (`npm test`, `npm run build`, `npm run test:e2e`) after the
FR-012 lockfile change.

## Risks

- Exception mechanism is process/documentation-based, not
  tool-enforced.
- `npm audit`'s advisory DB can surface new findings anytime — future
  PRs may fail on newly-disclosed advisories; this is intended gate
  behavior, not a defect.
- Artifact retention bounded (14 days) to avoid storage growth.
- Pre-existing unpinned `SonarSource/sonarqube-scan-action@v7.1.0` is
  out of scope, not modified.
- No secrets/cookies/auth touched.
- A high or critical severity advisory could be found in a package with
  no compatible non-breaking fix available at implementation time,
  requiring the exception procedure (FR-009/FR-010) rather than a
  direct fix; expected to be handled by that procedure rather than
  blocking the whole task.
- The prerequisite `package-lock.json` fix (FR-012), even though
  expected to be a non-breaking patch-level update, must still be
  validated against the existing test suite to avoid an undetected
  regression.
- If the automated dependency-update mechanism (FR-008) opens PRs
  faster than they can be reviewed, it may create maintenance overhead;
  accepted operational trade-off, not blocking.

## Implementation Steps

1. `git diff -- package-lock.json` to check for pre-existing local
   modifications.
2. Apply FR-012 lockfile fix; verify only the intended package changed.
3. Run local validation: `npm audit --omit=dev --audit-level=high`,
   `npm run build`, `npm test`, `npm run test:e2e`.
4. Edit `.github/workflows/sonar-backend.yml`: insert the report step
   and the gate step between `npm ci` and the coverage/test step.
5. Create `.github/dependabot.yml`.
6. Create `docs/dependency-vulnerability-policy.md`.
7. Verify via an actual GitHub Actions run (e.g. draft PR) that step
   ordering, gate pass/fail behavior, artifact upload, and the
   existing test/Sonar status checks (AC-007) all behave as expected.

## Definition of Done Mapping

- FR-001, FR-002 → new audit steps run against the lockfile-resolved
  tree, in CI, before/alongside existing steps → AC-001, AC-002, AC-009.
- FR-003, FR-004 → `npm audit --omit=dev --audit-level=high` gate step
  → AC-001.
- FR-005 → gate step scoped to `--audit-level=high` only → AC-002.
- FR-006, FR-007 → non-failing report step + `docs/
  dependency-vulnerability-policy.md` moderate-severity policy section
  → AC-003, AC-004.
- FR-008 → `.github/dependabot.yml` → AC-005.
- FR-009, FR-010 → exception procedure table + "How an exception is
  applied" section in the policy doc → AC-006.
- FR-011 → test-coverage and SonarCloud steps preserved, only reordered
  → AC-007.
- FR-012 → `package-lock.json` regeneration → AC-008, AC-009.

## Open Non-Blocking Questions

- The exact current `npm audit` output for `master` (beyond the
  specifically identified `ip-address` finding) was not independently
  re-verified at spec-writing time; the developer should pull a fresh
  audit at implementation time to confirm no other high/critical
  finding exists beyond the one described in FR-012.
- The exact tracked-issue mechanism for moderate-severity findings
  (e.g. a dedicated Notion task per finding, a recurring review task,
  or another tracking method) is left to developer judgment, provided
  it satisfies FR-006/AC-004.
- Policy doc language: Portuguese preferred to match
  `docs/sonar-quality-gate.md`; English acceptable alternative.
- Optional `github-actions` Dependabot ecosystem entry: developer's
  call, low-risk enhancement, not mandatory.

## Required Output

Plan:

`specs/CARSHOP-106/plan.md`

Status:

WRITTEN
