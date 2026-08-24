---
name: implementar
description: Implements a complete feature in this backend from a description or specification, including code, tests, documentation, and validation. Use only when the user invokes /implementar.
disable-model-invocation: true
---

# Implement feature

The task input is: `$ARGUMENTS`.

If the input points to a file, read it in full. If it's empty or doesn't define a verifiable goal, ask for the description or the path of a specification before editing.

## Agent coordination

For any feature that changes production code, the main conversation acts as coordinator and delegates sequentially:

1. `architect`: analyzes the requirement and returns the plan, risks, and test strategy.
2. `developer`: receives the specification and plan and implements the complete change.
3. `tester`: receives the specification, the plan, the implementation summary, and the diff; adds tests and runs the validations.
4. `reviewer`: receives all prior context and performs the final independent review.

Do not run `developer` and `tester` in parallel on the same worktree. If `reviewer` finds a `BLOCKER` or `HIGH` issue, delegate the specific fix to `developer`, repeat the affected validation with `tester`, and ask `reviewer` for final confirmation. After two correction rounds without resolution, stop and report the blocker with evidence.

Trivial changes limited to documentation or configuration can be done directly when the agents wouldn't add useful verification.

## 1. Understand

- Read `CLAUDE.md`, the specification, and the files directly involved.
- Inspect `git status` and preserve pre-existing changes.
- Turn the request into a goal, scope, out-of-scope, and acceptance criteria.
- Trace a similar feature end-to-end before choosing the structure.
- Make a reasonable assumption when it won't materially change the product; record it. Only ask when the missing decision would change the contract, security, data, or scope.

## 2. Plan

- Delegate the analysis to `architect` and present the user with a short plan listing the affected files/layers, risks, and planned validations.
- If the user only asked for a plan, or the session is in Plan Mode, stop before making edits.
- Outside Plan Mode, proceed after the plan, except when a material decision from the user is needed.

## 3. Implement

- Delegate the implementation to `developer`, passing the complete specification, the approved plan, and any user decision.
- Make the smallest coherent change that satisfies all criteria.
- For endpoints, cover as needed: types/ports, use case, adapter/model, controller, validation, route, composition, Swagger, and tests.
- Preserve compatibility and out-of-scope user changes.
- Do not read secret files, do not commit/push, and do not run destructive actions.

## 4. Validate

- Delegate thorough test creation and execution to `tester`.
- Run the most directly related tests first.
- For TypeScript, run `npm test` and `npm run build` at the end.
- Run `npm run test:e2e` when the HTTP contract, middleware, or server composition changes.
- Review `git diff` to detect accidental changes, incomplete code, and missing documentation.
- Don't hide failures. Clearly distinguish regressions introduced by this change from pre-existing issues.
- After testing, delegate the independent review to `reviewer` and process the findings by severity.

## 5. Deliver

Report objectively:

- the implemented result;
- the main files or areas changed;
- the validation commands and their results;
- limitations, assumptions, or genuinely necessary next steps.

For larger requirements, prefer receiving a file created from `docs/specs/TEMPLATE.md`.
