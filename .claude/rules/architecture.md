---
paths:
  - 'src/**/*.ts'
---
# Architecture Rules

Before implementing a feature:

1. Understand the current architecture.
2. Identify which layer owns the responsibility.
3. Inspect similar implementations already present in the project.
4. Reuse existing patterns whenever appropriate.
5. Do not introduce a new architectural pattern without justification.


# Arquitetura e dependências

- Respeite a direção das dependências: domínio e casos de uso não dependem de Express, Mongoose, Cloudinary ou detalhes de infraestrutura.
- Coloque contratos de fronteira em ports do domínio e implementações concretas em `src/infra`. Crie uma nova abstração somente quando existir uma fronteira real a isolar.
- Coloque regras de negócio em `src/usecase` ou, no módulo de autenticação, no `AuthService`. Um caso de uso deve depender de ports injetados pelo construtor.
- Use `src/infra/server.ts` como composition root principal e os builders em `src/infra/http/routes` para a composição por funcionalidade.
- Não implemente funcionalidades novas em `src/infra/http/server.ts`; esse arquivo é legado e não é chamado por `src/main/index.ts`.
- Use `src/infra/gateway/cloudinary/cloudinary-storage.service.ts` como adapter de imagens ativo. O arquivo de Cloudinary dentro de `src/core/domain/application/Gateway` é uma duplicação legada.
- Ao adicionar uma funcionalidade HTTP, verifique o fluxo completo: contrato/tipos, port, caso de uso, adapter, controller, rota, composition root, documentação e testes.
- Preserve compatibilidade dos contratos públicos, a menos que a especificação solicite explicitamente uma quebra.

Avoid:

- God classes
- God components
- Business rules inside controllers
- Business rules inside React components
- Circular dependencies
- Cross-layer imports
- Duplicated abstractions
- Premature abstraction

When there are multiple possible implementations, explain the trade-offs before choosing one.
