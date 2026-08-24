---
paths:
  - 'src/**/*.ts'
  - 'test/**/*.ts'
---

# Testes e validação

- Testes unitários ficam em `test/unit`, espelhando o caminho do arquivo em `src`; testes E2E ficam em `test/e2e/*.e2e-spec.ts`.
- Use Jest e siga os padrões de mocks já presentes. Repositories Mongo são testados mockando os modelos Mongoose, sem conexão real por padrão.
- Configure variáveis de ambiente de teste antes de importar módulos que leem `process.env` e restaure estado global após cada cenário.
- Toda correção de bug deve incluir um teste que falhe sem a correção. Toda funcionalidade deve cobrir caminho feliz, validação e principal caso de erro.
- Teste comportamento e contratos observáveis; evite acoplar testes a detalhes internos que não fazem parte do requisito.
- Execute primeiro o teste mais específico. Depois execute `npm test` e `npm run build` quando houver alteração em TypeScript.
- Execute `npm run test:e2e` quando mudar rotas, middlewares, autenticação, cookies, composição do servidor ou contratos HTTP ponta a ponta.
- Não remova assertions, ignore testes ou reduza cobertura apenas para fazer a suíte passar. Se uma falha for preexistente, registre evidências no resultado final.
