---
paths:
  - 'src/presentation/controllers/**/*.ts'
  - 'src/presentation/helpers/**/*.ts'
  - 'src/infra/http/routes/**/*.ts'
  - 'src/infra/presentation/validators/**/*.ts'
---

# Controllers e rotas

- Mantenha controllers finos: adapte Express, valide a entrada, chame um caso de uso e transforme o resultado em resposta HTTP. Regras de negócio pertencem ao caso de uso ou serviço de aplicação.
- Valide bodies com schemas Zod e `validateWithSchema` quando houver estrutura de payload. Valide parâmetros de rota com os helpers existentes.
- Preserve o padrão de handlers arrow `async` e capture falhas como `unknown`, encaminhando-as ao middleware central com `next(error)`.
- Faça a composição de controllers, casos de uso e middlewares nos builders de rotas. Não importe modelos Mongoose diretamente em controllers.
- Rotas administrativas devem usar `authMiddleware`. `POST /auth/refresh` e `POST /auth/logout` devem manter `csrfProtectionMiddleware`.
- Não altere silenciosamente status HTTP, formato de resposta, nomes de cookies ou headers que já façam parte do contrato público.
- Ao criar ou modificar endpoints, atualize os testes de controller/rota, o fragmento Swagger correspondente e os schemas OpenAPI afetados.
