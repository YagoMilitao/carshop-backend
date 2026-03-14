/* eslint-disable @typescript-eslint/no-unsafe-argument */
/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import * as bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import {
  randomToken,
  getAccessExpiresIn,
  //getRefreshExpiresIn,
  durationToMs,
} from './auth.util';

type JwtPayload = {
  sub: string; // userId
  email: string;
};

@Injectable()
export class AuthService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Valida credenciais do admin no banco.
   * Motivo: segurança real (senha hash) e base para controle de sessão.
   */
  async validateAdmin(email: string, password: string) {
    const user = await this.prisma.adminUser.findUnique({ where: { email } });
    if (!user) throw new UnauthorizedException('Credenciais inválidas.');

    const ok = await bcrypt.compare(password, user.password);
    if (!ok) throw new UnauthorizedException('Credenciais inválidas.');

    return user;
  }

  /**
   * Cria Access Token (JWT) curto.
   * Motivo: reduzir impacto se vazar (expira rápido).
   */
  signAccessToken(payload: JwtPayload) {
    const secret = process.env.JWT_SECRET;
    if (!secret) throw new Error('JWT_SECRET não configurado.');

    return jwt.sign(payload, secret, { expiresIn: getAccessExpiresIn() });
  }

  /**
   * Cria Refresh Token opaco (não-JWT) e salva HASH em sessão no DB.
   * Motivo: conseguimos revogar sessão e rotacionar refresh com segurança.
   */
  async createSession(
    userId: string,
    meta: { ip?: string; userAgent?: string },
  ) {
    const refreshToken = randomToken(48); // token aleatório longo
    const refreshTokenHash = await bcrypt.hash(refreshToken, 10);

    const refreshTtl = durationToMs(process.env.JWT_REFRESH_EXPIRES_IN ?? '7d');
    const expiresAt = new Date(Date.now() + refreshTtl);

    const session = await this.prisma.session.create({
      data: {
        userId,
        refreshTokenHash,
        expiresAt,
        ip: meta.ip,
        userAgent: meta.userAgent,
      },
      select: { id: true, expiresAt: true },
    });

    return {
      sessionId: session.id,
      refreshToken,
      refreshExpiresAt: session.expiresAt,
    };
  }

  /**
   * Rotaciona refresh token: invalida o antigo e cria hash novo.
   * Motivo: se um refresh vazar, ele perde validade após uso.
   */
  async rotateSession(sessionId: string) {
    const refreshToken = randomToken(48);
    const refreshTokenHash = await bcrypt.hash(refreshToken, 10);

    const refreshTtl = durationToMs(process.env.JWT_REFRESH_EXPIRES_IN ?? '7d');
    const expiresAt = new Date(Date.now() + refreshTtl);

    await this.prisma.session.update({
      where: { id: sessionId },
      data: { refreshTokenHash, expiresAt },
    });

    return { refreshToken, refreshExpiresAt: expiresAt };
  }

  /**
   * Valida refresh token contra o hash armazenado e checa revogação/expiração.
   */
  async validateRefresh(sessionId: string, refreshToken: string) {
    const session = await this.prisma.session.findUnique({
      where: { id: sessionId },
      include: { user: true },
    });

    if (!session) throw new UnauthorizedException('Sessão inválida.');
    if (session.revokedAt) throw new UnauthorizedException('Sessão revogada.');
    if (session.expiresAt.getTime() < Date.now())
      throw new UnauthorizedException('Sessão expirada.');

    const ok = await bcrypt.compare(refreshToken, session.refreshTokenHash);
    if (!ok) throw new UnauthorizedException('Refresh token inválido.');

    return session;
  }

  /**
   * Revoga sessão (logout).
   * Motivo: impedir novos refresh e encerrar a sessão no servidor.
   */
  async revokeSession(sessionId: string) {
    await this.prisma.session.update({
      where: { id: sessionId },
      data: { revokedAt: new Date() },
    });
  }
}
