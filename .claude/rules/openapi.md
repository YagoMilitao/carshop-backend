---
paths:
  - 'src/infra/docs/**/*.ts'
  - 'src/infra/swagger.ts'
  - 'src/infra/http/routes/**/*.ts'
  - 'src/presentation/controllers/**/*.ts'
---

# OpenAPI e contrato HTTP

- O comportamento real da rota, do controller e do middleware é a fonte para documentar o endpoint; não documente um contrato que o código não entrega.
- Mantenha os fragmentos por domínio em `src/infra/docs` e use o mecanismo existente de merge para preservar operações diferentes no mesmo path.
- Documente parâmetros, body, respostas de sucesso, principais erros, autenticação e proteção CSRF aplicáveis.
- Reutilize schemas e security schemes existentes antes de duplicá-los.
- Preserve os endpoints `/docs` e `/docs.json` e o controle por `ENABLE_SWAGGER`/`NODE_ENV`.
- Quando o contrato mudar, atualize documentação e testes no mesmo conjunto de alterações.
