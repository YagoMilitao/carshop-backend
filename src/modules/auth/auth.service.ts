import { createHash, randomUUID, timingSafeEqual } from 'crypto';
import {
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { sign, verify } from 'jsonwebtoken';
import {
  getAccessTokenExpiresIn,
  getCsrfCookieName,
  getJwtSecret,
  getRefreshCookieName,
  getRefreshTokenExpiresIn,
} from './auth.config';
import { createCsrfToken, parseCookies } from './auth.cookies';
import type { JwtPayload } from './auth.types';
import { SessionStoreService } from './session-store.service';

@Injectable()
export class AuthService {
  constructor(private readonly sessionStore: SessionStoreService) {}

  // Confere se as credenciais recebidas batem com o admin configurado no ambiente.
  validateAdmin(email: string, password: string) {
    const adminEmail = process.env.ADMIN_EMAIL;
    const adminPassword = process.env.ADMIN_PASSWORD;

    if (!adminEmail || !adminPassword) {
      throw new UnauthorizedException('Admin não configurado.');
    }

    const emailMatches = this.safeEquals(email, adminEmail);
    const passwordMatches = this.safeEquals(password, adminPassword);

    if (!emailMatches || !passwordMatches) {
      throw new UnauthorizedException('Credenciais inválidas.');
    }

    return { email };
  }

  // Abre uma nova sessão, gera tokens e armazena apenas o hash do refresh token.
  async login(email: string) {
    const sessionId = randomUUID();
    const csrfToken = createCsrfToken();
    const refreshToken = this.signToken({
      sub: email,
      sid: sessionId,
      type: 'refresh',
    });

    const refreshPayload = verify(refreshToken, getJwtSecret()) as JwtPayload;

    this.sessionStore.create({
      id: sessionId,
      email,
      csrfToken,
      refreshTokenHash: this.hashToken(refreshToken),
      expiresAt: (refreshPayload.exp ?? 0) * 1000,
    });

    return this.buildAuthResponse(email, sessionId, refreshToken, csrfToken);
  }

  // Renova a sessão com rotação de refresh token e de token CSRF.
  async refresh(cookieHeader: string | undefined, csrfHeader: string) {
    const session = this.validateRefreshRequest(cookieHeader, csrfHeader);

    const nextCsrfToken = createCsrfToken();
    const nextRefreshToken = this.signToken({
      sub: session.email,
      sid: session.id,
      type: 'refresh',
    });
    const refreshPayload = verify(nextRefreshToken, getJwtSecret()) as JwtPayload;

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

  // Revoga a sessão atual para impedir novos refreshes ou acessos vinculados a ela.
  logout(cookieHeader: string | undefined, csrfHeader: string) {
    const session = this.validateRefreshRequest(cookieHeader, csrfHeader);
    this.sessionStore.revoke(session.id);

    return { success: true };
  }

  // Retorna os dados básicos da sessão autenticada para um endpoint protegido.
  getSession(sessionId: string) {
    const session = this.sessionStore.findById(sessionId);

    if (!session || session.revokedAt || session.expiresAt <= Date.now()) {
      throw new UnauthorizedException('Sessão inválida ou expirada.');
    }

    return {
      sessionId: session.id,
      email: session.email,
      expiresAt: new Date(session.expiresAt).toISOString(),
    };
  }

  // Monta a resposta padrão do fluxo de autenticação com access token e metadados.
  private buildAuthResponse(
    email: string,
    sessionId: string,
    refreshToken: string,
    csrfToken: string,
  ) {
    return {
      accessToken: this.signToken({
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

  // Valida cookie, CSRF, assinatura e vínculo do refresh token com a sessão armazenada.
  private validateRefreshRequest(cookieHeader: string | undefined, csrfHeader: string) {
    const cookies = parseCookies(cookieHeader);
    const refreshToken = cookies[getRefreshCookieName()];
    const csrfCookie = cookies[getCsrfCookieName()];

    if (!refreshToken) {
      throw new UnauthorizedException('Refresh token ausente.');
    }

    if (!csrfCookie || csrfHeader !== csrfCookie) {
      throw new ForbiddenException('Falha na validação CSRF.');
    }

    const payload = verify(refreshToken, getJwtSecret()) as JwtPayload;

    if (payload.type !== 'refresh') {
      throw new UnauthorizedException('Token inválido para renovação.');
    }

    const session = this.sessionStore.findById(payload.sid);

    if (!session || session.revokedAt || session.expiresAt <= Date.now()) {
      throw new UnauthorizedException('Sessão inválida ou expirada.');
    }

    if (session.email !== payload.sub) {
      throw new UnauthorizedException('Sessão não corresponde ao token.');
    }

    if (!this.safeEquals(session.csrfToken, csrfHeader)) {
      throw new ForbiddenException('Token CSRF inválido.');
    }

    if (!this.safeEquals(session.refreshTokenHash, this.hashToken(refreshToken))) {
      throw new UnauthorizedException('Refresh token inválido.');
    }

    return session;
  }

  // Assina um JWT incluindo um identificador único para evitar tokens idênticos.
  private signToken(payload: JwtPayload) {
    const expiresIn =
      payload.type === 'access'
        ? getAccessTokenExpiresIn()
        : getRefreshTokenExpiresIn();

    return sign(
      {
        ...payload,
        jti: randomUUID(),
      },
      getJwtSecret(),
      { expiresIn },
    );
  }

  // Aplica hash ao refresh token para não persistir o valor bruto em memória.
  private hashToken(token: string) {
    return createHash('sha256').update(token).digest('hex');
  }

  // Compara valores sensíveis com proteção contra timing attacks simples.
  private safeEquals(left: string, right: string) {
    const leftBuffer = Buffer.from(left);
    const rightBuffer = Buffer.from(right);

    if (leftBuffer.length !== rightBuffer.length) return false;

    return timingSafeEqual(leftBuffer, rightBuffer);
  }
}
