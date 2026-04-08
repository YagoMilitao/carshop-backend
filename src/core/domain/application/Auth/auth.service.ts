import {
  createHash,
  randomBytes,
  randomUUID,
  timingSafeEqual,
} from 'node:crypto';

import type { SessionStorePort } from '../../repositories/session-store.repository';
import type { AuthSession } from './auth-session';
import { HttpError } from '../ApplicationError/http-error';
import type { AdminCredentialsProviderPort } from './admin-credentials-provider.port';
import type { TokenServicePort } from './token-service.port';

/**
 * Comando usado para refresh e logout.
 *
 * Motivo:
 * essas operações dependem do refresh token e da validação CSRF.
 */
export interface RefreshSessionCommand {
  refreshToken?: string;
  csrfCookieToken?: string;
  csrfHeaderToken?: string;
}

/**
 * Resposta padrão da autenticação.
 *
 * Motivo:
 * padronizar o formato devolvido para o controller HTTP.
 */
export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  csrfToken: string;
  sessionId: string;
  tokenType: 'Bearer';
}

/**
 * Estrutura retornada ao consultar a sessão atual.
 */
export interface AuthenticatedSessionView {
  sessionId: string;
  email: string;
  expiresAt: string;
}

/**
 * Camada de aplicação responsável pelas regras de autenticação.
 *
 * Motivo:
 * concentrar a regra de negócio fora do Express e fora das bibliotecas concretas.
 */
export class AuthService {
  constructor(
    private readonly sessionStore: SessionStorePort,
    private readonly tokenService: TokenServicePort,
    private readonly credentialsProvider: AdminCredentialsProviderPort,
  ) {}

  /**
   * Confere se as credenciais informadas correspondem ao admin configurado.
   *
   * Usamos comparação segura para reduzir risco de ataques por timing.
   */
  validateAdmin(email: string, password: string): { email: string } {
    const credentials = this.credentialsProvider.getAdminCredentials();

    if (!credentials) {
      throw new HttpError(401, 'Admin não configurado.');
    }

    const emailMatches = this.safeEquals(email, credentials.email);
    const passwordMatches = this.safeEquals(password, credentials.password);

    if (!emailMatches || !passwordMatches) {
      throw new HttpError(401, 'Credenciais inválidas.');
    }

    return { email };
  }

  /**
   * Cria uma nova sessão autenticada e devolve os tokens necessários.
   */
  login(email: string): AuthTokens {
    const sessionId = randomUUID();
    const csrfToken = this.createCsrfToken();

    const refreshToken = this.tokenService.sign({
      sub: email,
      sid: sessionId,
      type: 'refresh',
    });

    const refreshPayload = this.tokenService.verify(refreshToken);

    const session: AuthSession = {
      id: sessionId,
      email,
      csrfToken,
      refreshTokenHash: this.hashToken(refreshToken),
      expiresAt: (refreshPayload.exp ?? 0) * 1000,
    };

    this.sessionStore.create(session);

    return this.buildAuthResponse(email, sessionId, refreshToken, csrfToken);
  }

  /**
   * Faz rotação de refresh token e CSRF token.
   *
   * Motivo:
   * reduzir risco de replay e aumentar segurança da sessão.
   */
  refresh(command: RefreshSessionCommand): AuthTokens {
    const session = this.validateRefreshRequest(command);
    const nextCsrfToken = this.createCsrfToken();

    const nextRefreshToken = this.tokenService.sign({
      sub: session.email,
      sid: session.id,
      type: 'refresh',
    });

    const refreshPayload = this.tokenService.verify(nextRefreshToken);

    const updatedSession = this.sessionStore.update(session.id, {
      csrfToken: nextCsrfToken,
      refreshTokenHash: this.hashToken(nextRefreshToken),
      expiresAt: (refreshPayload.exp ?? 0) * 1000,
    });

    if (!updatedSession) {
      throw new HttpError(401, 'Não foi possível atualizar a sessão.');
    }

    return this.buildAuthResponse(
      session.email,
      session.id,
      nextRefreshToken,
      nextCsrfToken,
    );
  }

  /**
   * Revoga a sessão atual.
   */
  logout(command: RefreshSessionCommand): { success: true } {
    const session = this.validateRefreshRequest(command);
    this.sessionStore.revoke(session.id);

    return { success: true };
  }

  /**
   * Consulta a sessão autenticada atual.
   */
  getSession(sessionId: string): AuthenticatedSessionView {
    const session = this.sessionStore.findById(sessionId);

    if (!session || session.revokedAt || session.expiresAt <= Date.now()) {
      throw new HttpError(401, 'Sessão inválida ou expirada.');
    }

    return {
      sessionId: session.id,
      email: session.email,
      expiresAt: new Date(session.expiresAt).toISOString(),
    };
  }

  /**
   * Monta a resposta de autenticação com access token,
   * refresh token, csrf token e dados da sessão.
   */
  private buildAuthResponse(
    email: string,
    sessionId: string,
    refreshToken: string,
    csrfToken: string,
  ): AuthTokens {
    return {
      accessToken: this.tokenService.sign({
        sub: email,
        sid: sessionId,
        type: 'access',
      }),
      refreshToken,
      csrfToken,
      sessionId,
      tokenType: 'Bearer',
    };
  }

  /**
   * Valida a requisição de refresh/logout.
   *
   * Esta validação inclui:
   * - existência do refresh token
   * - validação do CSRF
   * - verificação do token
   * - verificação da sessão
   * - conferência do hash do refresh armazenado
   */
  private validateRefreshRequest(command: RefreshSessionCommand): AuthSession {
    if (!command.refreshToken) {
      throw new HttpError(401, 'Refresh token ausente.');
    }

    if (
      !command.csrfCookieToken ||
      !command.csrfHeaderToken ||
      command.csrfHeaderToken !== command.csrfCookieToken
    ) {
      throw new HttpError(403, 'Falha na validação CSRF.');
    }

    const payload = this.tokenService.verify(command.refreshToken);

    if (payload.type !== 'refresh') {
      throw new HttpError(401, 'Token inválido para renovação.');
    }

    const session = this.sessionStore.findById(payload.sid);

    if (!session || session.revokedAt || session.expiresAt <= Date.now()) {
      throw new HttpError(401, 'Sessão inválida ou expirada.');
    }

    if (session.email !== payload.sub) {
      throw new HttpError(401, 'Sessão não corresponde ao token.');
    }

    if (!this.safeEquals(session.csrfToken, command.csrfHeaderToken)) {
      throw new HttpError(403, 'Token CSRF inválido.');
    }

    if (
      !this.safeEquals(
        session.refreshTokenHash,
        this.hashToken(command.refreshToken),
      )
    ) {
      throw new HttpError(401, 'Refresh token inválido.');
    }

    return session;
  }

  /**
   * Gera um token CSRF aleatório e seguro.
   */
  private createCsrfToken(): string {
    return randomBytes(24).toString('hex');
  }

  /**
   * Gera hash SHA-256 do refresh token.
   *
   * Motivo:
   * nunca persistimos o refresh token puro na sessão.
   */
  private hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  /**
   * Faz comparação segura entre duas strings.
   *
   * Motivo:
   * reduzir risco de ataques por análise de tempo.
   */
  private safeEquals(left: string, right: string): boolean {
    const leftBuffer = Buffer.from(left);
    const rightBuffer = Buffer.from(right);

    if (leftBuffer.length !== rightBuffer.length) {
      return false;
    }

    return timingSafeEqual(leftBuffer, rightBuffer);
  }
}
