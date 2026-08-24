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

# Security

- Never read, log, return, or commit values from `.env`, passwords, JWT secrets, refresh tokens, session cookies, or Cloudinary credentials.
- Preserve the short-lived access token model, rotating refresh token, server-side session, and explicit revocation.
- Preserve the double-submit CSRF protection on refresh and logout: `csrf_token` cookie plus `X-CSRF-Token` header.
- Refresh cookies must remain `HttpOnly`; the `Secure`, `SameSite`, path, and expiration attributes must not be weakened.
- Validate type, signature, expiration, and session binding before accepting tokens. Use constant-time comparison for sensitive values when the existing flow requires it.
- Admin routes require authentication; new mutating routes must have rate limiting, CSRF, or equivalent controls appropriate to the authentication mechanism used.
- Uploads must keep a size limit, an explicit list of MIME types, and safe cleanup of temporary files.
- Required variables must be validated at startup. Do not introduce default secrets for production nor expose internal details in error messages.
- Changes to authentication, authorization, cookies, upload, or CORS require both success and rejection tests, plus a Swagger review.
