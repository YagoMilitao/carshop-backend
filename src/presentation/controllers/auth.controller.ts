import type { NextFunction, Request, Response } from 'express';
import type { AuthService } from '../../core/domain/application/Auth/auth.service';
import { HttpError } from '../../core/domain/application/ApplicationError/http-error';
import {
  getCsrfCookieName,
  getRefreshCookieName,
} from '../../infra/constants/auth.constants';
import {
  clearAuthCookies,
  parseCookies,
  setAuthCookies,
} from '../helpers/auth.cookies';
import { validateLoginPayload } from '../helpers/login.validator';

/**
 * Controller HTTP: adapta requisições Express
 * para comandos da camada de aplicação.
 */
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  login = async (
    request: Request,
    response: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const loginInput = validateLoginPayload(request.body);

      this.authService.validateAdmin(loginInput.email, loginInput.password);

      const authResult = await this.authService.login(loginInput.email);

      setAuthCookies(response, authResult.refreshToken, authResult.csrfToken);

      response.status(200).json({
        accessToken: authResult.accessToken,
        sessionId: authResult.sessionId,
        tokenType: authResult.tokenType,
      });
    } catch (error: unknown) {
      next(error);
    }
  };

  refresh = async (
    request: Request,
    response: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const cookies = parseCookies(request.headers.cookie);

      const authResult = await this.authService.refresh({
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
    } catch (error: unknown) {
      next(error);
    }
  };

  logout = async (
    request: Request,
    response: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const cookies = parseCookies(request.headers.cookie);

      const result = await this.authService.logout({
        refreshToken: cookies[getRefreshCookieName()],
        csrfCookieToken: cookies[getCsrfCookieName()],
        csrfHeaderToken: request.header('x-csrf-token') ?? undefined,
      });

      clearAuthCookies(response);

      response.status(200).json(result);
    } catch (error: unknown) {
      next(error);
    }
  };

  getSession = async (
    request: Request,
    response: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      if (!request.auth) {
        throw new HttpError(401, 'Não autenticado.');
      }

      const session = await this.authService.getSession(request.auth.sessionId);

      response.status(200).json(session);
    } catch (error: unknown) {
      next(error);
    }
  };
}
