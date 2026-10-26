# CARSHOP-140 — Add anti-bot protection to public write endpoints

## Status

Ready

## Source

Notion Task:
CARSHOP-140

- Type: Task
- Priority: Medium
- Sprint: 6
- Epic: Backend Base & Segurança
- Stack: Backend
- Components: Comments, Auth
- Points: 3
- Blocking / Blocked by: none

## Context

The CarShop backend already has rate limiting (CARSHOP-13/14) and brute-force
protection on login (CARSHOP-105). There is no control specifically aimed at
automation/bots on public (unauthenticated) write endpoints, especially the
public comment creation endpoint, through which visitors submit comments that
remain pending until admin approval.

Rate limiting restricts request volume but does not distinguish automated
clients from legitimate visitors. The task asks for an anti-automation layer,
proportional to risk, that complements (and does not replace or duplicate) the
existing limiters.

Repository context (terminology only, not new requirements): the public
comment creation endpoint is `POST /works/{workId}/comments`, which today is
already protected by a dedicated comment rate limiter. `POST /auth/login` is
public and already protected by the login rate limiter from CARSHOP-105.

## Objective

The public comment creation endpoint rejects requests identified as automated,
while legitimate comment submissions continue to be accepted, without relying
solely on `User-Agent`, without exposing secrets or internal details on
failures, and without weakening, replacing or duplicating the existing rate
limiting and brute-force protections. The resulting policy and configuration
are documented.

## Functional Requirements

FR-001 — The public comment creation endpoint (`POST /works/{workId}/comments`)
must apply an anti-bot mitigation before the comment is accepted for
persistence.

FR-002 — A comment creation request that satisfies the anti-bot mechanism's
acceptance conditions, and that is otherwise valid under the existing comment
rules, must continue to be accepted with the existing success behavior.

FR-003 — A comment creation request identified by the anti-bot mechanism as
automated must be rejected, and no comment must be persisted for that request.

FR-004 — The anti-bot decision must not depend solely on the `User-Agent`
header. A request must not be classified as legitimate only because it carries
a browser-like `User-Agent`, nor as automated only because its `User-Agent` is
missing or non-browser-like.

FR-005 — When the anti-bot mechanism itself fails (for example: an external
provider error, a timeout, an invalid or malformed verification input, or a
missing configuration), the response returned to the client must not contain
secrets, credentials, provider raw responses, stack traces, or internal
configuration details.

FR-006 — The behavior applied when the anti-bot mechanism fails (accept or
reject the request) must be deterministic, defined by an explicit policy, and
documented (see FR-008). The policy itself is an architect decision
(see Open Questions).

FR-007 — The anti-bot layer may be applied to other public write endpoints
in addition to comment creation, only where the architect's evaluation
justifies it as proportional to risk. Any additional endpoint covered must
satisfy FR-002 through FR-006 for that endpoint.

FR-008 — The anti-bot policy and its configuration must be documented,
including: which endpoints are covered, what signals/mechanism is used at a
level that does not weaken the protection, the failure policy, the rejection
response, and the names (never values) of any configuration/environment
variables involved.

FR-009 — If the public HTTP contract of any covered endpoint changes (for
example, a new required or optional request field, header, or a new rejection
status/response), the OpenAPI documentation for that endpoint must describe
the change, consistent with the actual behavior.

## Non-Functional Requirements

NFR-001 — Compatibility with existing protections: the existing rate limiters
(CARSHOP-13/14, including the comment rate limiter) and the login brute-force
protection (CARSHOP-105) must remain active with unchanged limits and
behavior. The anti-bot layer must complement them and must not replace or
duplicate them (no new volume-based limiter equivalent to an existing one on
the same endpoint).

NFR-002 — Proportionality: the chosen mechanism must be proportional to the
risk of the covered endpoints. The justification for the chosen mechanism
(including false-positive risk for legitimate visitors) must be recorded by
the architect.

NFR-003 — Security: no secret value used by the mechanism (if any) may be
hardcoded, committed, logged, or returned in responses. Any required secret
must be provided through environment configuration validated at startup,
following the existing environment validation pattern.

NFR-004 — Accessibility and UX: if the chosen mechanism requires a challenge
or any interaction in the frontend, accessibility and user experience impact
must be considered and recorded (for example: availability of an accessible
path for users of assistive technologies, and no interaction required beyond
what the mechanism strictly needs).

NFR-005 — Reliability: the behavior of the endpoint when the anti-bot
mechanism is unavailable or slow must be bounded and predictable, per the
documented failure policy (FR-006).

NFR-006 — Testability: acceptance and rejection paths of the anti-bot layer
must be covered by automated tests without depending on a real external
service.

## Acceptance Criteria

AC-001 — When a comment creation request satisfies the anti-bot acceptance
conditions and is otherwise valid, the endpoint returns the same success
status and response shape it returns today, and the comment is persisted as
pending.

AC-002 — When a comment creation request is identified as automated by the
anti-bot mechanism, the endpoint rejects it with the documented rejection
status and response, and no comment is persisted.

AC-003 — When two comment creation requests are identical except for the
`User-Agent` header, and both satisfy the anti-bot acceptance conditions, both
are treated the same by the anti-bot layer (the `User-Agent` alone does not
flip the decision).

AC-004 — When two comment creation requests carry the same browser-like
`User-Agent`, and one of them fails the anti-bot conditions, that one is
rejected (a browser-like `User-Agent` alone does not grant acceptance).

AC-005 — After the change, exceeding the existing comment rate limit still
produces the existing rate-limit rejection (`429`), and the login rate limiter
from CARSHOP-105 still rejects excess login attempts with its existing
behavior.

AC-006 — When the anti-bot mechanism fails (simulated provider error, timeout,
or invalid/malformed verification input, as applicable to the chosen
mechanism), the endpoint behaves according to the documented failure policy,
and the response body and headers contain no secret, credential, provider raw
response, stack trace, or internal configuration detail.

AC-007 — If the mechanism requires a secret or configuration, starting the
application with that required configuration missing or invalid fails at
startup with a message that references only the variable name, never its
value.

AC-008 — The anti-bot policy and configuration are documented in a versioned
location, covering every item listed in FR-008, with no secret or real
environment values.

AC-009 — If the contract of a covered endpoint changed, `GET /docs.json`
describes the new request input(s) and the rejection response for that
endpoint, matching the actual behavior.

AC-010 — If the chosen mechanism requires frontend interaction, the
documentation records the accessibility and UX considerations (NFR-004). If no
frontend interaction is required, the documentation states so.

AC-011 — Automated tests cover at least: acceptance of a legitimate request,
rejection of an automated request, the non-`User-Agent`-only behavior, the
failure-policy path, and the preservation of the existing rate limiting.

AC-012 — For any additional public write endpoint covered under FR-007,
AC-001, AC-002, AC-006 and AC-011 hold for that endpoint as well.

## Constraints

- The mechanism must be chosen only after evaluating need and impact. Examples
  given by the task: an external challenge/token provider, or a honeypot plus
  server-side signals. The choice belongs to the architect.
- Existing rate limiters (CARSHOP-13/14) and login brute-force protection
  (CARSHOP-105) must not be replaced, weakened, or duplicated.
- Detection must not rely only on `User-Agent`.
- Failures must not expose secrets or internal details.
- Everything documented under `specs/` and elsewhere must use variable names
  only, never values.
- Existing public contracts must be preserved unless a change is required by
  the chosen mechanism; any such change must be documented (FR-009).

## Dependencies

- CARSHOP-13/14 — existing rate limiting (must be preserved).
- CARSHOP-105 — existing login brute-force protection (must be preserved).
- Possible frontend dependency if a client-side challenge or a new request
  field is introduced; no linked frontend task exists.
- Possible external provider and new dependency if a provider-based mechanism
  is chosen (subject to architect evaluation).

## Out of Scope

- Replacing, retuning, or duplicating the existing rate limiters
  (CARSHOP-13/14) or the login brute-force protection (CARSHOP-105).
- Implementing frontend changes in this repository (any frontend impact is
  identified and documented only).
- Anti-bot protection on authenticated admin routes.

## Risks

- An external provider introduces a new integration, possibly a new
  dependency, new environment variables and secrets.
- A honeypot field or challenge token may change the public comment creation
  contract, affecting Swagger, tests and frontend compatibility.
- False positives may block legitimate visitors' comments.
- An undefined fail-open/fail-closed policy may cause either loss of
  protection or loss of availability when the mechanism fails.
- Risk of duplicating existing limiters (explicitly forbidden).
- A contract change without a linked frontend task may break the current
  frontend comment submission.

## Open Questions

### Blocking

None.

### Non-blocking

Decisions delegated to the architect (must be recorded in the plan):

1. Mechanism choice: external challenge/token provider vs honeypot plus
   server-side signals (or another proportional alternative), with
   justification per NFR-002.
2. Failure policy: fail-open vs fail-closed (possibly per failure type), per
   FR-006 / NFR-005.
3. Exact contract shape: request inputs (field/header names), rejection HTTP
   status and response format, consistent with the existing error contract.
4. Whether any public write endpoint other than comment creation is covered
   (FR-007), including whether `POST /auth/login` is in scope given the
   component "Auth" is marked while brute force is already covered by
   CARSHOP-105.
5. Documentation location (README, Swagger, `docs/`, or a combination).

Questions for product/frontend (do not block backend specification):

6. Objective criterion for "proportional to risk" is not defined by the task.
7. Frontend impact and coordination, since no frontend task is linked.

## Traceability

FR-001 → AC-001, AC-002, AC-011
FR-002 → AC-001
FR-003 → AC-002
FR-004 → AC-003, AC-004
FR-005 → AC-006, AC-007
FR-006 → AC-006, AC-008
FR-007 → AC-012
FR-008 → AC-008
FR-009 → AC-009
NFR-001 → AC-005
NFR-002 → AC-008
NFR-003 → AC-006, AC-007
NFR-004 → AC-010
NFR-005 → AC-006
NFR-006 → AC-011
