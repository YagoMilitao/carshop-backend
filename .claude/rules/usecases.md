---
paths:
  - 'src/usecase/**/*.ts'
  - 'src/core/domain/**/*.ts'
---

# Domínio e casos de uso

- Casos de uso devem expressar regras de negócio sem conhecer Request/Response, modelos Mongoose ou SDKs externos.
- Receba dependências por ports e construtor. Não instancie repositories ou gateways concretos dentro do caso de uso.
- Valide invariantes antes de persistir e use `HttpError` com status e mensagem coerentes com o restante da API para falhas esperadas.
- Normalize dados no limite responsável pela regra, preservando os padrões existentes de `trim()` e lowercase para slug, categoria, tags e campos equivalentes.
- Retorne tipos do domínio, não documentos Mongoose nem objetos específicos do provider.
- Ao ampliar um port, atualize todas as implementações e dublês de teste afetados.
- Cubra caminho feliz, validações e falhas relevantes com testes unitários focados no comportamento observável.
