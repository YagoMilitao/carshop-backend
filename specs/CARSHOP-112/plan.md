# CARSHOP-112 — Implementation Plan

## Source

Specification:
`specs/CARSHOP-112/spec.md`

## Architect Verdict

READY FOR IMPLEMENTATION

## Objective

Create a new, independent GitHub Actions workflow ("Codex pipeline") that
runs `npm run build` + `npm test` on every PR targeting `master`,
publishing a distinct status check, and configure `master` branch
protection to require that check before merge (blocking on
pending/running/failed/cancelled, allowing only on success). Validate
end-to-end with one passing and one failing test PR. Maps to
FR-001..FR-008 / AC-001..AC-007 / NFR-001..NFR-004. No `src/**` business
logic is touched.

## Existing Knowledge (Obsidian)

- ADR on coordinator-gated branch-naming enforcement over git
  hooks/CI: relevant, not conflicting — it reserves git-hook/CI
  enforcement as a future complementary mechanism for other concerns and
  is fully compatible with this task.
- Legacy Cloudinary-duplicate build breakage (CARSHOP-81 era
  troubleshooting note): not reproducing today — confirmed locally that
  `npm run build` and `npm test` both pass cleanly on `master` (57
  suites / 273 tests, no build errors).

## Current Architecture

- `.github/workflows/sonar-backend.yml` is the only existing workflow.
  Conventions reused from it:
  - `actions/checkout@08eba0b27e820071cde6df949e0beb9ba4906955 # v4.3.0`
  - `actions/setup-node@49933ea5288caeca8642d1e84afbd3f7d6820020 # v4.4.0`
    with `node-version: 20`, npm cache enabled
  - `npm ci` for install
  - minimal `permissions: contents: read`
- `package.json` scripts: `build` → `tsc -p tsconfig.build.json`;
  `test` → `jest` (`test/unit/**/*.spec.ts` only).
- Unit specs self-seed `process.env`; no global CI env vars are required
  for `npm test`.
- No `.nvmrc`; Node 20 is the established convention from the existing
  workflow and the README.

## Proposed Solution

### 1. New workflow file — `.github/workflows/codex.yml`

- `name: Codex Pipeline`
- Trigger: `on: pull_request: branches: [master]`
- `permissions: contents: read`
- Single job, explicit id `build-and-test` (no separate job `name:`
  override — this id is the required-status-check context).
- Steps: checkout (pinned SHA as above), setup-node (pinned SHA as
  above, node 20, cache npm), `npm ci`, `npm run build`, `npm test`.
- No `fetch-depth: 0` needed (shallow clone sufficient — an intentional
  divergence from `sonar-backend.yml`).
- Do not touch `sonar-backend.yml`.
- Exact required-check context to configure in branch protection:
  `build-and-test`.

### 2. Branch protection on `master`

- Mechanism: classic branch protection via `gh api` (REST
  `PUT /repos/{owner}/{repo}/branches/master/protection`), not a GitHub
  ruleset. Rationale: single-branch scope, matches the spec's own
  language, no IaC tool exists in the repo, and this avoids introducing
  new tooling for one required-check addition.
- This step requires GitHub repo-admin credentials (NFR-002) and MUST
  NOT be executed by `developer`/`tester` agents (least privilege). It
  is a manual/admin (user) step, performed after the workflow file
  exists on `master`.
- Sequence for the admin:
  1. `gh api repos/{owner}/{repo}/branches/master/protection` to inspect
     current state first (avoid clobbering existing settings such as
     Sonar's required context or PR review requirements).
  2. Apply via PUT, merging with any existing config rather than
     overwriting (the classic protection API replaces the whole object
     on PUT — must fetch-then-merge). Contexts must include
     `build-and-test` (and any pre-existing required contexts, e.g.
     Sonar's, if already required).
  3. Confirm via
     `gh api repos/{owner}/{repo}/branches/master/protection --jq .required_status_checks.contexts`
     that `build-and-test` is listed.

### 3. End-to-end validation (AC-007) — outside Jest's scope, manual/admin step

- Success scenario: throwaway PR (branch following `branching.md`
  taxonomy, e.g. `test/CARSHOP-112-codex-pipeline-check`) with a trivial
  harmless change outside `src/`, confirm via `gh pr checks` that
  `build-and-test` passes and merge becomes allowed.
- Failure scenario: throwaway PR that intentionally breaks build/test in
  a scratch/non-shipped location (never real production code), confirm
  the check fails and merge is blocked (`mergeStateStatus: BLOCKED`).
- Both throwaway PRs closed/deleted afterward without merging into
  `master`.
- Must be performed by a human/admin with repo write+admin access, after
  branch protection is live.

## Technical Decisions

### Decision

Use a single new workflow file `.github/workflows/codex.yml` with one
job (id `build-and-test`) triggered on `pull_request` targeting
`master`, running checkout → setup-node (Node 20) → `npm ci` →
`npm run build` → `npm test`.

### Reason

Mirrors the existing, already-working `sonar-backend.yml` conventions
(pinned action SHAs, Node 20, npm cache, `npm ci`, minimal
`contents: read` permissions), keeping the new pipeline consistent and
low-risk while satisfying FR-001 through FR-004 and NFR-004.

### Alternatives Considered

- Extending `sonar-backend.yml` with additional steps instead of a new
  file — rejected because the spec explicitly requires a separate,
  distinct workflow/status check (FR-001), and Constraints/Out of Scope
  prohibit modifying `sonar-backend.yml`.
- Using a GitHub ruleset instead of classic branch protection for the
  required-check configuration — rejected in favor of classic branch
  protection given single-branch scope, no existing IaC tooling in the
  repo, and to avoid introducing new tooling for one required-check
  addition.

### Trade-offs

- Classic branch protection API replaces the whole protection object on
  PUT, requiring a fetch-then-merge step by the admin to avoid
  clobbering existing settings (e.g., Sonar's required context).
- The required-check context name (`build-and-test`) is a manually
  maintained string; if the job id or workflow structure is renamed
  later, branch protection must be updated in lockstep (NFR-003).

## Execution Flow

1. Developer creates `.github/workflows/codex.yml` per the structure
   above.
2. Developer/tester validate locally: YAML validity, and that
   `npm run build` / `npm test` succeed independent of the workflow file
   itself.
3. PR merges the workflow file into `master`.
4. Admin (user, with repo-admin access) configures branch protection on
   `master` to require the `build-and-test` status check, using
   fetch-then-merge via `gh api`.
5. Admin performs the AC-007 end-to-end validation using throwaway
   success/failure test PRs, then closes/deletes those PRs without
   merging.

## Files

### Files to Create

| File | Responsibility |
|---|---|
| `.github/workflows/codex.yml` | Codex pipeline: checkout, node setup, install, build, test on `pull_request` → `master` |

### Files to Modify

None. No `src/**`, no `test/**` production files are affected.

## Contract Impact

None. No HTTP contract change.

## Persistence Impact

None.

## Security Impact

- No credentials, tokens, or secrets are introduced or exposed by the
  new workflow.
- Branch protection configuration requires repository administrator
  access (NFR-002) and must be performed by a human admin, not by an
  automated agent.
- Workflow permissions are scoped minimally (`contents: read`),
  consistent with `sonar-backend.yml`.

## Swagger Impact

None. No API endpoints, payloads, or contracts change.

## Testing Strategy

- Unit-test coverage policy: **Justified Exception, "Not applicable"** —
  zero `src/**/*.ts` production code is introduced; only a GitHub
  Actions YAML file plus external GitHub repository configuration.
  Coverage obtained: N/A (0 lines of `src/**` changed). Uncovered parts:
  none applicable. Residual risk: workflow correctness is validated via
  YAML validity plus the underlying build/test commands already being
  covered by the existing test suite. This exception follows
  `.claude/rules/testing.md`'s "Not applicable" criterion (no
  custom logic under `src/**` is being introduced).
- Tester can validate locally: YAML syntactic validity of `codex.yml`
  (plain YAML parse, no new dependency); that `npm run build`/`npm test`
  currently succeed (confirmed); that the workflow's
  `on.pull_request.branches` targets `master` and is a distinct
  file/job from `sonar-backend.yml` (diff/text inspection).
- Requires manual/live GitHub verification (outside Jest): AC-001,
  AC-003–AC-006 (merge-blocking behavior for pending/failed/cancelled/
  success), AC-007 (documented success+failure test PRs) — all require a
  real PR against the real GitHub repo with branch protection actually
  configured.

## Risks

- Context-name drift (NFR-003): renaming the job id or file structure
  later requires a branch-protection update in lockstep, or the
  required check silently stops being enforced or blocks forever.
  Document via comment in the workflow file.
- PUT-replaces-object gotcha on the classic branch protection API — the
  admin must fetch-then-merge.
- Clean-CI-env assumption: `npm test` needs no global env per existing
  convention (mirrors `sonar-backend.yml`'s already-working invocation).
- No emergency-merge bypass — explicitly out of scope per spec;
  acceptable residual risk.
- No rollback/exception path exists for legitimate emergency merges if
  the Codex pipeline becomes unavailable (residual risk, not a
  requirement of this task — see spec's Out of Scope).
- If the workflow's Node.js setup, dependency installation, or
  environment does not match what is needed to run
  `npm run build`/`npm test` successfully, the check could fail for
  reasons unrelated to actual code quality, blocking legitimate merges
  until corrected.

## Implementation Steps

1. Create `.github/workflows/codex.yml` with:
   - `name: Codex Pipeline`
   - `on: pull_request: branches: [master]`
   - `permissions: contents: read`
   - Job id `build-and-test` with steps: checkout (pinned SHA), setup-node
     (pinned SHA, Node 20, npm cache), `npm ci`, `npm run build`,
     `npm test`.
2. Validate locally that the YAML is syntactically valid and that
   `npm run build` / `npm test` succeed.
3. Confirm the new workflow is distinct from and does not modify
   `sonar-backend.yml`.
4. Open a PR with the new workflow file targeting `master`.
5. (Admin/manual, outside developer/tester scope) Configure `master`
   branch protection to require the `build-and-test` status check via
   `gh api`, using fetch-then-merge.
6. (Admin/manual) Perform AC-007 end-to-end validation with one
   success-scenario and one failure-scenario throwaway PR, then close
   them without merging.

## Definition of Done Mapping

- FR-001 → Implementation Step 1 (new, separate workflow file).
- FR-002 → Implementation Step 1 (`pull_request` trigger on `master`).
- FR-003 → Implementation Step 1 (checkout, node setup, install, build,
  test steps).
- FR-004 → Implementation Step 1 (distinct job id `build-and-test`
  produces a distinct status check from Sonar's).
- FR-005 → Implementation Step 5 (branch protection requires
  `build-and-test`).
- FR-006 → Implementation Step 5 + AC-003 validation.
- FR-007 → Implementation Step 5 + AC-004/AC-005 validation.
- FR-008 → Implementation Step 5 + AC-006 validation.
- NFR-001 → Implementation Step 5 (exact context name `build-and-test`
  used in branch protection configuration).
- NFR-002 → Branch protection performed only by repo-admin (Step 5), not
  by developer/tester agents.
- NFR-003 → Documented as a residual risk (see Risks); requires manual
  lockstep maintenance if renamed.
- NFR-004 → Implementation Step 1 (build/test commands and Node setup
  consistent with `CLAUDE.md`/README conventions).
- AC-001 through AC-007 → Implementation Steps 4–6 (manual/admin
  end-to-end validation against the live GitHub repository).

## Open Non-Blocking Questions

- Does this requirement apply only to `master`, or should it also apply
  to other long-lived branches in the future? Per the spec, only
  `master` is in scope for this task; no other branch was named.
