---
paths:
  - 'src/**/*.ts'
  - 'test/**/*.ts'
---

# TypeScript and style

- Maintain compatibility with TypeScript strict mode, CommonJS, and the ES2020 target defined in `tsconfig.json`.
- Prefer explicit types at public boundaries and `unknown` for untrusted values or caught errors. Do not introduce `any`, `as any`, `@ts-nocheck`, `@ts-ignore`, or unsafe casts without documented necessity.
- Use `import type` for type-only imports and preserve the import style of the nearby file. The `@/*` alias points to `src/*`.
- Preserve constructor injection and `private readonly` properties in services and use cases.
- Reuse existing helpers and types before creating duplicate versions.
- Follow Prettier: single quotes, trailing commas, and automatic formatting. Do not make formatting changes to files outside the scope.
- Do not add a library when the platform or an existing dependency solves the problem simply and safely.
- Do not change scripts, dependency versions, or lockfiles as a side effect of a feature without explaining the need.
- explicit domain types
- interfaces where extension is expected
- type aliases for unions and compositions
- discriminated unions where appropriate
- readonly data when mutation is unnecessary

## Functions

Functions should:

- have one clear responsibility
- have descriptive names
- remain small when reasonable
- avoid hidden side effects

## Naming

Use descriptive names.

Bad:

const d = getData();

Good:

const userProfile = getUserProfile();

Avoid meaningless names such as:

data
info
obj
temp
value

unless the context genuinely makes them obvious.
