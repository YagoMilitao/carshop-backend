import type { NextFunction, Request, Response } from 'express';
import { getCsrfCookieName, getRefreshCookieName } from '../../auth.config';
import type { AuthService } from '../../application/services/auth.service';
import { clearAuthCookies, parseCookies, setAuthCookies } from './auth.cookies';
import { validateLoginPayload } from './validators/login.validator';

// Controller HTTP: adapta requisições Express para comandos da camada de aplicação.
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  login = (request: Request, response: Response, next: NextFunction) => {
    try {
      const loginInput = validateLoginPayload(request.body);
      this.authService.validateAdmin(loginInput.email, loginInput.password);

      const authResult = this.authService.login(loginInput.email);
      setAuthCookies(response, authResult.refreshToken, authResult.csrfToken);

      response.status(200).json({
        accessToken: authResult.accessToken,
        sessionId: authResult.sessionId,
        tokenType: authResult.tokenType,
      });
    } catch (error) {
      next(error);
    }
  };

  refresh = (request: Request, response: Response, next: NextFunction) => {
    try {
      const cookies = parseCookies(request.headers.cookie);
      const authResult = this.authService.refresh({
        refreshToken: cookies[getRefreshCookieName()],
        csrfCookieToken: cookies[getCsrfCookieName()],
        csrfHeaderToken: request.header('x-csrf-token') ?? undefined,
      });
      setAuthCookies(response, authResult.refreshToken, authResult.csrfToken);

      response.status(200).json({
        accessToken: authResult.accessToken,
        sessionId: authResult.sessionId,
        tokenType: authResult.tokenType,
      });
    } catch (error) {
      next(error);
    }
  };

  logout = (request: Request, response: Response, next: NextFunction) => {
    try {
      const cookies = parseCookies(request.headers.cookie);
      const result = this.authService.logout({
        refreshToken: cookies[getRefreshCookieName()],
        csrfCookieToken: cookies[getCsrfCookieName()],
        csrfHeaderToken: request.header('x-csrf-token') ?? undefined,
      });

      clearAuthCookies(response);
      response.status(200).json(result);
    } catch (error) {
      next(error);
    }
  };

  getSession = (request: Request, response: Response, next: NextFunction) => {
    try {
      const session = this.authService.getSession(request.auth!.sessionId);
      response.status(200).json(session);
    } catch (error) {
      next(error);
    }
  };
}
