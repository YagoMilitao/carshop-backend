---
paths:
  - 'src/**/*.ts'
  - 'test/**/*.ts'
---

# TypeScript e estilo

- Mantenha compatibilidade com TypeScript strict, CommonJS e target ES2020 definidos em `tsconfig.json`.
- Prefira tipos explícitos nas fronteiras públicas e `unknown` para valores não confiáveis ou erros capturados. Não introduza `any`, `as any`, `@ts-nocheck`, `@ts-ignore` ou casts inseguros sem necessidade documentada.
- Use `import type` para imports usados somente como tipo e preserve o estilo de imports do arquivo próximo. O alias `@/*` aponta para `src/*`.
- Preserve injeção por construtor e propriedades `private readonly` nos serviços e casos de uso.
- Reutilize helpers e tipos existentes antes de criar versões duplicadas.
- Siga Prettier: aspas simples, trailing commas e formatação automática. Não faça alterações de formatação em arquivos fora do escopo.
- Não adicione uma biblioteca quando a plataforma ou uma dependência existente resolver o problema de forma simples e segura.
- Não altere scripts, versões de dependências ou lockfiles como efeito colateral de uma funcionalidade sem explicar a necessidade.
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