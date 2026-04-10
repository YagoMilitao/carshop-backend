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
 * Esses fluxos dependem do refresh token e da validação CSRF.
 */
export interface RefreshSessionCommand {
  refreshToken?: string;
  csrfCookieToken?: string;
  csrfHeaderToken?: string;
}

/**
 * Resposta padrão da autenticação.
 *
 * accessToken:
 *   token curto usado nas rotas protegidas.
 *
 * refreshToken:
 *   token usado para renovar a sessão.
 *
 * csrfToken:
 *   token usado na proteção CSRF.
 *
 * sessionId:
 *   identificador lógico da sessão atual.
 */
export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  csrfToken: string;
  sessionId: string;
  tokenType: 'Bearer';
}

/**
 * Estrutura retornada ao consultar a sessão autenticada.
 */
export interface AuthenticatedSessionView {
  sessionId: string;
  email: string;
  expiresAt: string;
}

/**
 * Serviço de autenticação da camada de aplicação.
 *
 * Responsabilidades:
 * - validar credenciais do admin
 * - abrir sessão
 * - renovar sessão
 * - revogar sessão
 * - consultar sessão autenticada
 *
 * Importante:
 * esta classe não conhece Express, cookies ou banco concreto.
 * Ela trabalha apenas com portas/contratos.
 */
export class AuthService {
  constructor(
    private readonly sessionStore: SessionStorePort,
    private readonly tokenService: TokenServicePort,
    private readonly credentialsProvider: AdminCredentialsProviderPort,
  ) {}

  /**
   * Valida as credenciais do admin.
   *
   * Continua síncrono porque a origem atual das credenciais
   * vem do provider de ambiente.
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
   * Cria uma nova sessão autenticada.
   *
   * Agora é async porque persiste a sessão no repositório,
   * e o repositório passou a ser assíncrono por causa do MongoDB.
   */
  async login(email: string): Promise<AuthTokens> {
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

    await this.sessionStore.create(session);

    return this.buildAuthResponse(email, sessionId, refreshToken, csrfToken);
  }

  /**
   * Renova refresh token e CSRF token.
   *
   * Também é async porque:
   * - consulta a sessão
   * - atualiza a sessão
   */
  async refresh(command: RefreshSessionCommand): Promise<AuthTokens> {
    const session = await this.validateRefreshRequest(command);
    const nextCsrfToken = this.createCsrfToken();

    const nextRefreshToken = this.tokenService.sign({
      sub: session.email,
      sid: session.id,
      type: 'refresh',
    });

    const refreshPayload = this.tokenService.verify(nextRefreshToken);

    const updatedSession = await this.sessionStore.update(session.id, {
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
  async logout(command: RefreshSessionCommand): Promise<{ success: true }> {
    const session = await this.validateRefreshRequest(command);

    await this.sessionStore.revoke(session.id);

    return { success: true };
  }

  /**
   * Consulta os dados da sessão autenticada atual.
   */
  async getSession(sessionId: string): Promise<AuthenticatedSessionView> {
    const session = await this.sessionStore.findById(sessionId);

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
   * Monta a resposta final da autenticação.
   *
   * O access token é gerado a cada login/refresh,
   * enquanto o refresh token já foi gerado antes.
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
   * Valida toda a requisição de refresh/logout.
   *
   * Regras:
   * - refresh token precisa existir
   * - CSRF cookie e header precisam existir e bater
   * - token precisa ser do tipo refresh
   * - sessão precisa existir e estar ativa
   * - email do token precisa bater com a sessão
   * - hash do refresh token precisa bater com a sessão persistida
   */
  private async validateRefreshRequest(
    command: RefreshSessionCommand,
  ): Promise<AuthSession> {
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

    const session = await this.sessionStore.findById(payload.sid);

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
   * Gera um CSRF token aleatório.
   */
  private createCsrfToken(): string {
    return randomBytes(24).toString('hex');
  }

  /**
   * Gera hash SHA-256 do refresh token.
   *
   * Motivo:
   * nunca persistir o token puro.
   */
  private hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  /**
   * Comparação segura de strings.
   *
   * Motivo:
   * reduzir risco de ataques por timing.
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
