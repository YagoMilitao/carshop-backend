# CARSHOP-130 — Implementation Plan

## Source

Specification:
`specs/CARSHOP-130/spec.md`

## Architect Verdict

READY FOR IMPLEMENTATION

## Objective

Fix `getRefreshTokenMaxAgeMs()` in `src/presentation/helpers/auth.cookies.ts`
so that a numerically valid but non-positive (`<= 0`) value of
`JWT_REFRESH_COOKIE_MAX_AGE_MS` also triggers the existing 7-day fallback,
instead of being used as-is. Missing/empty/NaN behavior and valid
positive-value behavior must remain unchanged. Acceptance criteria are
AC-001 through AC-008 in `specs/CARSHOP-130/spec.md`.

## Current Architecture

Current code (`auth.cookies.ts` lines 13-23):

```ts
function getRefreshTokenMaxAgeMs(): number {
  const value = process.env.JWT_REFRESH_COOKIE_MAX_AGE_MS;
  if (!value) {
    return 7 * 24 * 60 * 60 * 1000;
  }
  const asNumber = Number(value);
  return Number.isNaN(asNumber) ? 7 * 24 * 60 * 60 * 1000 : asNumber;
}
```

Bug confirmed: `asNumber <= 0` (e.g. `"0"`, `"-1000"`) is returned as-is.
The fallback applies unconditionally today (no `NODE_ENV` gating). The
helper is consumed only by `setAuthCookies`, applying the same `maxAge` to
both the `refresh_token` and `csrf_token` cookies.

Existing test file `test/unit/presentation/helpers/auth.cookies.spec.ts`
covers: default fallback (no env var), valid positive override (`'1234'`),
NaN fallback (`'not-a-number'`). It does NOT cover `"0"` or negative
values.

`docs/api-contract.md` (lines 72-73) currently says the fallback applies
"se a variável não estiver definida ou for inválida" — not wrong but
should explicitly state non-positive values are treated as invalid, per
AC-008.

## Proposed Solution

```ts
function getRefreshTokenMaxAgeMs(): number {
  const DEFAULT_REFRESH_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
  const value = process.env.JWT_REFRESH_COOKIE_MAX_AGE_MS;

  if (!value) {
    return DEFAULT_REFRESH_MAX_AGE_MS;
  }

  const asNumber = Number(value);

  if (Number.isNaN(asNumber) || asNumber <= 0) {
    return DEFAULT_REFRESH_MAX_AGE_MS;
  }

  return asNumber;
}
```

Extracting the repeated literal into a local constant is optional
cleanup, not mandatory. This is a pure value-validation change: no change
to cookie names, `httpOnly`, `secure`, `sameSite`, `path`, function
signature, or exported surface. `setAuthCookies` and `clearAuthCookies`
remain untouched.

## Technical Decisions

### Decision

Add an `asNumber <= 0` condition (combined via OR with the existing
`Number.isNaN` check) inside `getRefreshTokenMaxAgeMs()` so that
non-positive numeric values also fall back to the 7-day default.

### Reason

Closes the gap identified in NFR-001/FR-003: a numerically valid but
non-positive configured value currently bypasses the fallback and is used
directly as `maxAge`, producing a session cookie (`maxAge: 0`) or an
invalid/immediate expiration.

### Alternatives Considered

None recorded as materially different — the architect confirmed the
existing fallback pattern is unconditional (no `NODE_ENV` gating) and
extended it consistently, per the "Unconditional vs. Production-Gated
Validation" historical pattern.

### Trade-offs

Strictly narrows an existing fallback condition; cannot regress
currently-passing valid-positive-value or missing/NaN scenarios. No
security regression — closes a real gap without touching CSRF or
cookie-attribute logic (ADR-016 boundary respected).

## Execution Flow

1. Update `getRefreshTokenMaxAgeMs()` in `src/presentation/helpers/auth.cookies.ts`
   to also fall back to the 7-day default when the resolved numeric value
   is `<= 0`.
2. Extend `test/unit/presentation/helpers/auth.cookies.spec.ts` with cases
   for `"0"` and negative values, and confirm/clarify existing cases for
   missing, empty-string, NaN, and valid-positive values.
3. Update `docs/api-contract.md` (lines 72-73) to explicitly state that
   non-positive values (zero or negative) also fall back to the 7-day
   default, referencing only the variable name.
4. Run the specific test file, then `npm test` and `npm run build`.

## Files

### Files to Create

None.

### Files to Modify

- `src/presentation/helpers/auth.cookies.ts` — only production code
  change, confined to `getRefreshTokenMaxAgeMs()`.
- `test/unit/presentation/helpers/auth.cookies.spec.ts` — add/extend cases
  for `"0"` and negative value triggering fallback, clarify existing
  positive-value and NaN cases per AC-001–AC-007.
- `docs/api-contract.md` (lines 72-73) — reword to explicitly state
  non-positive values (zero or negative) also fall back to the 7-day
  default, referencing only the variable name, never a real value.

No route, controller, use case, port, model, or Swagger fragment changes.

## Contract Impact

No change to HTTP status codes, response bodies, headers, cookie names, or
cookie attributes. Only the computed numeric `maxAge` value used
internally when the env var is misconfigured with a non-positive number.

## Persistence Impact

None.

## Security Impact

Low risk: strictly narrows an existing fallback condition; cannot regress
currently-passing valid-positive-value or missing/NaN scenarios. No
security regression — closes a real gap per spec NFR-001, without
touching CSRF or cookie-attribute logic (ADR-016 boundary respected). No
production data/env values referenced anywhere.

## Swagger Impact

None. No route, controller, header, status code, or payload changes.

## Testing Strategy

Extend `test/unit/presentation/helpers/auth.cookies.spec.ts` with
independent cases:

- `JWT_REFRESH_COOKIE_MAX_AGE_MS = '0'` → asserts `maxAge` on both cookies
  equals the default 7-day value (AC-004).
- `JWT_REFRESH_COOKIE_MAX_AGE_MS = '-1000'` → asserts fallback to default
  (AC-005).
- Keep/confirm existing missing-value case (AC-001), add explicit
  empty-string case (AC-002).
- Keep existing NaN case (AC-003).
- Keep/confirm existing valid-positive case still passes through unchanged
  (AC-006).

Small, fully unit-testable pure-function change with no I/O — `>= 80%`
new/changed-code coverage target easily achievable, effectively ~100% on
changed lines. No exception needed.

Run: `npx jest test/unit/presentation/helpers/auth.cookies.spec.ts`, then
`npm test` and `npm run build`. `npm run test:e2e` is not strictly
required by the trigger list, but a quick check that existing e2e auth
specs (if any assert `maxAge`) still pass is reasonable due diligence.
Update `docs/api-contract.md` in the same change per AC-008.

## Risks

- Without this fix, a non-positive configured value silently produces a
  session cookie or invalid expiration, breaking refresh/logout — a
  security/session-reliability risk, not merely cosmetic (as stated in
  the source task).

## Implementation Steps

1. Apply the code change to `getRefreshTokenMaxAgeMs()`.
2. Add/extend unit tests for `"0"`, negative, empty-string, NaN, and
   valid-positive cases.
3. Update `docs/api-contract.md` per AC-008.
4. Run `npx jest test/unit/presentation/helpers/auth.cookies.spec.ts`,
   `npm test`, and `npm run build`.
5. Optionally run `npm run test:e2e` as due diligence if existing e2e auth
   specs assert `maxAge`.

## Definition of Done Mapping

- FR-001 → AC-001 → covered by existing/confirmed missing-value test.
- FR-002 → AC-003 → covered by existing NaN test.
- FR-003 → AC-004, AC-005 → covered by new `"0"` and negative-value tests.
- FR-004 → AC-006 → covered by existing/confirmed valid-positive test.
- FR-005 → AC-001..AC-006 → covered by asserting `maxAge` on both refresh
  and CSRF cookies in each case.
- NFR-001 → AC-004, AC-005 → covered by new non-positive fallback tests.
- NFR-002 → AC-006 → covered by confirming cookie attributes remain
  unchanged.
- AC-007 → full test suite update in
  `test/unit/presentation/helpers/auth.cookies.spec.ts`.
- AC-008 → `docs/api-contract.md` update.

## Open Non-Blocking Questions

None.
