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
 * Controller HTTP da autenticação.
 *
 * Responsabilidade:
 * adaptar requisições/respostas Express para chamadas da camada de aplicação.
 *
 * Motivo:
 * manter o framework HTTP fora da regra de negócio.
 */
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  /**
   * Realiza login do admin.
   *
   * Fluxo:
   * 1. valida payload
   * 2. valida credenciais
   * 3. cria sessão e tokens
   * 4. grava cookies
   * 5. devolve access token no body
   */
  login = (request: Request, response: Response, next: NextFunction): void => {
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
    } catch (error: unknown) {
      next(error);
    }
  };

  /**
   * Renova os tokens da sessão atual.
   *
   * Fluxo:
   * 1. lê refresh token e csrf token dos cookies
   * 2. lê csrf token do header
   * 3. delega a renovação ao AuthService
   * 4. regrava os cookies
   * 5. devolve novo access token
   */
  refresh = (
    request: Request,
    response: Response,
    next: NextFunction,
  ): void => {
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
    } catch (error: unknown) {
      next(error);
    }
  };

  /**
   * Encerra a sessão atual.
   *
   * Fluxo:
   * 1. lê cookies
   * 2. delega logout ao AuthService
   * 3. limpa cookies
   * 4. devolve confirmação
   */
  logout = (request: Request, response: Response, next: NextFunction): void => {
    try {
      const cookies = parseCookies(request.headers.cookie);

      const result = this.authService.logout({
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

  /**
   * Retorna os dados da sessão autenticada atual.
   *
   * Esta rota depende do auth middleware já ter anexado request.auth.
   */
  getSession = (
    request: Request,
    response: Response,
    next: NextFunction,
  ): void => {
    try {
      if (!request.auth) {
        throw new HttpError(401, 'Não autenticado.');
      }

      const session = this.authService.getSession(request.auth.sessionId);

      response.status(200).json(session);
    } catch (error: unknown) {
      next(error);
    }
  };
}
