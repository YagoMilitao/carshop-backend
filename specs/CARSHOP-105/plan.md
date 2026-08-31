# Implementation Plan — CARSHOP-105

Task ID: CARSHOP-105
Specification: `specs/CARSHOP-105/spec.md`
Architect Verdict: READY FOR IMPLEMENTATION

## Interpreted Objective and Acceptance Criteria

Remediate all currently known, fixable npm dependency vulnerabilities in this backend, prioritizing production dependencies and high severity, while minimizing regression risk — with mandatory documentation for any advisory left unfixed. Mapped to spec.md AC-001..AC-007 (production audit clean of high+moderate; full audit clean of high; build/unit/E2E green; lockfile diff reviewed; unfixed advisories documented with exploitability judgment).

## Repository State (at planning time, via Read/Glob/Grep only — no Bash access)

`package.json` and `package-lock.json` currently show the same exact versions as the 2026-08-27 baseline quoted in the task:

- `express@5.2.1`, `express-rate-limit@8.3.2`, `mongoose@9.4.1`, `morgan@1.10.1`, `body-parser@2.2.2` (transitive of express), `qs@6.15.0` / `6.14.1` / `6.14.0` (multiple resolved copies, transitive), `ip-address@10.1.0` (transitive of `express-rate-limit`), `kareem@3.2.0` (transitive of `mongoose`), `jsonwebtoken@9.0.3`.

**Important limitation flagged by architect**: the architect agent has only Read/Glob/Grep — no shell access — so it could not execute `npm audit` itself. Since the lockfile still matches the stale baseline exactly, there is no evidence the vulnerabilities have already been fixed. The developer must treat a freshly-run `npm audit` (with Bash access) as the authoritative source of truth for exact advisories/target versions.

## Repo Touchpoints per Package Family

- **express / body-parser**: `src/infra/config/middleware.ts` (`express.json({limit:'1mb'})`), `src/infra/server.ts`, all route builders in `src/infra/http/routes/*.routes.ts`, and critically `src/infra/presentation/middleware/error-handler.middleware.ts` — confirmed still has the correct 4-arg `ErrorRequestHandler` signature (`error, _request, response, _next`), so the CARSHOP-104 arity bug is not currently regressed. `body-parser` is a transitive dependency of `express@5.2.1`, which declares the compatible range `^2.2.1`; prefer a non-forcing audit fix or targeted lockfile update when the patched `body-parser` release satisfies that range, without changing Express or adding an override. Only consider updating Express or adding a narrowly scoped `overrides` entry if the required patched version falls outside Express's declared range and no compatible parent release is available.
- **express-rate-limit / ip-address**: `src/infra/presentation/middleware/rate-limit.middleware.ts` (`globalRateLimitMiddleware`, config-object based, no direct use of low-level IP-parsing APIs — `ip-address` is an internal dependency of trust-proxy IP key-generation logic). A same-major patch/minor of `express-rate-limit` (already on `8.x`) is unlikely to require code changes since only documented top-level options are used (`windowMs`, `limit`, `standardHeaders`, `legacyHeaders`, `message`, `skipSuccessfulRequests`).
- **mongoose**: `src/data/models/*.model.ts` (all six models), `src/infra/repositories/mongo-*.repository.ts`. Confirmed `schema.pre(...)` hooks exist in `src/data/models/work.model.ts` and `src/data/models/portfolio-work.ts`. Per Obsidian troubleshooting note, if mongoose bumps (already at major `9.x`; check whether audit requires 9.x→10.x or stays within 9.x), `test/unit/data/models/work.model.spec.ts`-style specs that reach into `schema.s.hooks._pres` (a `kareem` internal, `kareem@3.2.0` currently) are at risk of silently breaking on shape changes — not because business logic regressed, but because the internal changed. Must be explicitly re-verified, not assumed passing or assumed broken.
- **morgan**: only used in `src/infra/config/middleware.ts` for HTTP logging (`'combined'`/`'dev'` format strings, standard options) — low usage-surface, low regression risk regardless of version.
- **qs**: transitive of `express`/`express-rate-limit`; not imported directly anywhere in `src/`. An `overrides` entry is the lowest-risk remediation path if a compatible patched `qs` exists independent of bumping its parents.

## Ordered Upgrade Plan

Because the architect could not execute the audit, this is a decision procedure the developer must execute in order, not a fixed list of version numbers (spec.md's Constraints section explicitly leaves exact versions to fresh implementation-time audit data):

1. **Step 0** (developer, has Bash): run `npm audit --omit=dev --json` and `npm audit --json` fresh; capture full output before touching anything. This supersedes the 2026-08-27 baseline.
2. For each flagged production package, in priority order — high severity first, then moderate, then low only if trivially bundled with a required fix:
   a. Prefer `npm audit fix` (non-forcing) first — patch/minor only, no lockfile downgrade risk beyond semver-safe range.
   b. If the advisory requires a version outside the current semver caret range but still same-major, bump the `package.json` version explicitly and re-lock.
   c. If the advisory requires a **major** bump (flag explicitly if this applies to `mongoose` or `express-rate-limit`, matching spec's called-out risk): do **not** use `npm audit fix --force` blindly. Read the target major's changelog/migration notes, apply minimal compatible code changes in the touchpoints listed above, and re-run full validation (step 4) before accepting.
   d. If the advisory is only fixable via a transitive dependency (`body-parser`, `qs`, `ip-address`, `kareem`) and the direct parent (`express`, `express-rate-limit`, `mongoose`) has no compatible fixed release yet, use the existing `overrides` block in `package.json` to pin the transitive package to the patched version, following the same pattern already used for `path-to-regexp`/`picomatch`. Verify with `npm ls <package>` that only the intended package version resolves repo-wide (no unintended duplicate/downgraded copies).
3. Repeat for dev-only high-severity vulnerabilities (FR-002): same procedure, restricted to `devDependencies`. If no compatible update exists for a dev-only advisory, do not force it — move to step 5 documentation instead.
4. **Validation gate after every risky (major-bump or override) step**, not just once at the end:
   - `npm run build`
   - `npm test` (unit)
   - Specifically re-run/inspect `test/unit/data/models/work.model.spec.ts` (and `portfolio-work` equivalent if it has a mirrored spec) if `mongoose`/`kareem` changed — confirm whether `schema.s.hooks._pres` shape is still valid; if it changed shape, that is an internal-testing-technique issue, not necessarily a business-logic regression — must be explicitly assessed, not assumed.
   - `npm run test:e2e`, specifically the login-failure scenario in `test/e2e/app.e2e-spec.ts` if `express` changed at all — confirm JSON error body is still returned (no fallthrough to Express's default HTML error page).
5. **Documentation of unfixed advisories** (FR-003/AC-007): for every advisory with no compatible update, record in the developer's implementation summary (not in `spec.md`, which must not be modified): affected package, advisory identifier as reported by `npm audit`, why no fix exists, and an explicit exploitability judgment for this app's runtime context (reasoning, not just conclusion).
6. **Lockfile review** (FR-006/AC-006): after `npm install`, diff `package-lock.json` against its pre-change state. Confirm: no package version is lower than before for any package not intentionally downgraded; no unrelated package appears/disappears; `overrides` entries (if added) are minimal and scoped only to the vulnerable transitive package.
7. **Final full validation**: `npm run build`, `npm test`, `npm run test:e2e`, and both audit commands again to confirm AC-001/AC-002 are satisfied.

## Affected Layers/Files (for developer)

- `package.json` (dependency versions, possibly `overrides` additions)
- `package-lock.json` (regenerated, reviewed)
- Potentially `src/data/models/*.model.ts`, `src/infra/repositories/mongo-*.repository.ts` if mongoose major bump requires API adjustments
- Potentially `src/infra/presentation/middleware/rate-limit.middleware.ts` if express-rate-limit major bump changes config shape
- Potentially `src/infra/config/middleware.ts` if express/body-parser/morgan option shapes change
- No new files, no new architectural pattern — pure version-bump + narrow compatibility fixes, matching spec.md's Constraints section.

## HTTP Contract / Data Model Impact

None expected by default. If a major bump forces an unavoidable breaking change (e.g., rate-limit response shape, JSON body-parser error format), it must be explicitly reported per spec.md's Constraints, and the corresponding Swagger fragment under `src/infra/docs/*.swagger.ts` and its tests updated in the same change — not expected unless a major bump proves unavoidable.

## Risks and Compatibility

- Major bumps on mongoose/express-rate-limit could break APIs; mitigated by staged validation after each risky step (not just at the end).
- Fragile area 1 (error-handler arity/Express dispatch): currently intact; re-verify via E2E if express version changes at all, since a formatter auto-fix or unrelated edit could silently strip the trailing `_next` param.
- Fragile area 2 (mongoose pre-save hook internal test technique): currently present in `work.model.ts`/`portfolio-work.ts` specs; re-verify internal shape if mongoose/kareem changes.
- Residual risk that architect's package-impact analysis is based on currently-installed (stale-matching) versions rather than the truly-fresh audit result; developer's Step 0 output governs actual target versions.

## Test and Validation Strategy

Pure dependency remediation with no new/changed business logic in `src/` by default. Per `.claude/rules/testing.md`'s coverage policy, the `>=80%` new/changed-code target applies to new/changed production code; if remediation stays within pure version bumps and no compatibility code changes are needed, there is no new/changed `src/` logic to cover, so the coverage target is not applicable in that scenario (justified exception: "not applicable"). If a major bump forces actual code changes in a touchpoint file, that specific changed logic must be covered by unit tests per existing patterns, and the exception no longer applies to those lines. The existing full unit and E2E suites (especially the two fragile-area tests) are the primary regression safety net (FR-004/AC-004/AC-005).

## Existing Knowledge (Obsidian) — Relevance and Current Validity

1. Error-handler arity bug (CARSHOP-104) — relevant, still valid: current `error-handler.middleware.ts` has the correct 4-arg signature; must be explicitly re-verified via E2E login-failure scenario if express version changes at all.
2. Mongoose pre-save hook internal-test-technique fragility — relevant, still valid: `work.model.ts` and `portfolio-work.ts` both have `pre()` hooks; their specs likely use the internal `kareem`-shape technique; must be re-verified if mongoose/kareem versions change.
3. ADR-003 (bias against new runtime deps) — weakly relevant; this task adds no new dependency, only version bumps and possibly `overrides` entries (already established pattern), so compatible.
4. No vault knowledge for express-rate-limit/ip-address/morgan/body-parser/qs specifically — confirmed, derived directly from repo usage above.

## Verdict

READY FOR IMPLEMENTATION
