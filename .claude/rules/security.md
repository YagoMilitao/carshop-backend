---
paths:
  - 'src/core/domain/application/Auth/**/*.ts'
  - 'src/infra/constants/auth.constants.ts'
  - 'src/infra/config/env*.ts'
  - 'src/infra/http/routes/auth.routes.ts'
  - 'src/infra/presentation/middleware/**/*.ts'
  - 'src/infra/middleware/upload.middleware.ts'
  - 'src/presentation/controllers/auth.controller.ts'
  - 'src/presentation/helpers/auth.cookies.ts'
  - 'src/infra/gateway/**/*.ts'
---

# Segurança

- Nunca leia, registre, retorne ou versione valores de `.env`, senhas, secrets JWT, refresh tokens, cookies de sessão ou credenciais do Cloudinary.
- Preserve o modelo de access token curto, refresh token rotativo, sessão server-side e revogação explícita.
- Preserve a proteção double-submit CSRF em refresh e logout: cookie `csrf_token` mais header `X-CSRF-Token`.
- Cookies de refresh devem continuar `HttpOnly`; atributos `Secure`, `SameSite`, path e expiração não devem ser enfraquecidos.
- Valide tipo, assinatura, expiração e vínculo da sessão antes de aceitar tokens. Use comparação segura para valores sensíveis quando o fluxo existente exigir.
- Rotas administrativas precisam de autenticação; novas rotas mutáveis devem ter rate limiting, CSRF ou controles equivalentes conforme o mecanismo de autenticação usado.
- Uploads devem manter limite de tamanho, lista explícita de MIME types e limpeza segura de temporários.
- Variáveis obrigatórias devem ser validadas no startup. Não introduza secrets padrão para produção nem exponha detalhes internos em mensagens de erro.
- Mudanças em autenticação, autorização, cookies, upload ou CORS exigem testes de sucesso e rejeição, além de revisão do Swagger.
