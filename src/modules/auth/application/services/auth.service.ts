import { createHash, randomBytes, randomUUID, timingSafeEqual } from 'crypto';
import type { AdminCredentialsProviderPort } from '../../domain/ports/admin-credentials-provider.port';
import type { SessionStorePort } from '../../domain/ports/session-store.port';
import type { TokenServicePort } from '../../domain/ports/token-service.port';
import { HttpError } from '../../../../shared/errors/http-error';

export interface RefreshSessionCommand {
  refreshToken?: string;
  csrfCookieToken?: string;
  csrfHeaderToken?: string;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  csrfToken: string;
  sessionId: string;
  tokenType: 'Bearer';
}

// Camada de aplicação: regras de autenticação desacopladas do framework HTTP.
export class AuthService {
  constructor(
    private readonly sessionStore: SessionStorePort,
    private readonly tokenService: TokenServicePort,
    private readonly credentialsProvider: AdminCredentialsProviderPort,
  ) {}

  // Confere se as credenciais recebidas batem com o admin configurado.
  validateAdmin(email: string, password: string) {
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

  // Abre uma nova sessão, gera refresh/csrf e devolve também um access token.
  login(email: string) {
    const sessionId = randomUUID();
    const csrfToken = this.createCsrfToken();
    const refreshToken = this.tokenService.sign({
      sub: email,
      sid: sessionId,
      type: 'refresh',
    });

    const refreshPayload = this.tokenService.verify(refreshToken);

    this.sessionStore.create({
      id: sessionId,
      email,
      csrfToken,
      refreshTokenHash: this.hashToken(refreshToken),
      expiresAt: (refreshPayload.exp ?? 0) * 1000,
    });

    return this.buildAuthResponse(email, sessionId, refreshToken, csrfToken);
  }

  // Faz rotação de refresh token + CSRF para reduzir risco de replay.
  refresh(command: RefreshSessionCommand) {
    const session = this.validateRefreshRequest(command);
    const nextCsrfToken = this.createCsrfToken();
    const nextRefreshToken = this.tokenService.sign({
      sub: session.email,
      sid: session.id,
      type: 'refresh',
    });

    const refreshPayload = this.tokenService.verify(nextRefreshToken);

    this.sessionStore.update(session.id, {
      csrfToken: nextCsrfToken,
      refreshTokenHash: this.hashToken(nextRefreshToken),
      expiresAt: (refreshPayload.exp ?? 0) * 1000,
    });

    return this.buildAuthResponse(
      session.email,
      session.id,
      nextRefreshToken,
      nextCsrfToken,
    );
  }

  // Revoga a sessão atual para impedir novos refreshes após logout.
  logout(command: RefreshSessionCommand) {
    const session = this.validateRefreshRequest(command);
    this.sessionStore.revoke(session.id);
    return { success: true };
  }

  // Consulta segura da sessão autenticada para endpoint protegido.
  getSession(sessionId: string) {
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

  private validateRefreshRequest(command: RefreshSessionCommand) {
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

  private createCsrfToken() {
    return randomBytes(24).toString('hex');
  }

  private hashToken(token: string) {
    return createHash('sha256').update(token).digest('hex');
  }

  private safeEquals(left: string, right: string) {
    const leftBuffer = Buffer.from(left);
    const rightBuffer = Buffer.from(right);

    if (leftBuffer.length !== rightBuffer.length) return false;

    return timingSafeEqual(leftBuffer, rightBuffer);
  }
}
