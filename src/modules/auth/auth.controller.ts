/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-argument */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import {
  Body,
  Controller,
  Get,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import express from 'express';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { CsrfGuard } from './csrf.guard';
import { randomToken, durationToMs } from './auth.util';
import { RequireAuthGuard } from './require-auth.guard';

function isProd() {
  return process.env.NODE_ENV === 'production';
}

/**
 * Opções do cookie:
 * - httpOnly: true no refresh (JS não acessa, reduz XSS)
 * - sameSite: 'lax' ajuda contra CSRF
 * - secure: true em produção (apenas HTTPS)
 */
function refreshCookieOptions(maxAgeMs: number) {
  return {
    httpOnly: true,
    secure: isProd(),
    sameSite: 'lax' as const,
    maxAge: maxAgeMs,
    path: '/auth', // refresh/logout ficam em /auth; reduz superfície
  };
}

function csrfCookieOptions(maxAgeMs: number) {
  return {
    httpOnly: false, // precisa ser lido pelo JS para enviar no header
    secure: isProd(),
    sameSite: 'lax' as const,
    maxAge: maxAgeMs,
    path: '/auth',
  };
}

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @UseGuards(RequireAuthGuard)
  @Get('me')
  me(@Req() req: any) {
    return { user: req.user };
  }

  @Post('login')
  async login(
    @Body() dto: LoginDto,
    @Req() req: any,
    @Res({ passthrough: true }) res: express.Response,
  ) {
    const user = await this.authService.validateAdmin(dto.email, dto.password);

    // Cria sessão (refresh) com metadados úteis
    const { sessionId, refreshToken } = await this.authService.createSession(
      user.id,
      {
        ip: req.ip,
        userAgent: req.headers['user-agent'],
      },
    );

    // Access token curto
    const accessToken = this.authService.signAccessToken({
      sub: user.id,
      email: user.email,
    });

    // CSRF token (double submit)
    const csrfToken = randomToken(32);

    // Cookies
    const refreshMaxAge = durationToMs(
      process.env.JWT_REFRESH_EXPIRES_IN ?? '7d',
    );

    res.cookie(
      'refresh_token',
      refreshToken,
      refreshCookieOptions(refreshMaxAge),
    );
    res.cookie('session_id', sessionId, {
      // session_id não precisa ser httpOnly, mas pode ser:
      // Manter httpOnly reduz riscos de XSS.
      httpOnly: true,
      secure: isProd(),
      sameSite: 'lax' as const,
      maxAge: refreshMaxAge,
      path: '/auth',
    });
    res.cookie('csrf_token', csrfToken, csrfCookieOptions(refreshMaxAge));

    return { accessToken, csrfToken };
  }

  @UseGuards(CsrfGuard)
  @Post('refresh')
  async refresh(
    @Req() req: any,
    @Res({ passthrough: true }) res: express.Response,
  ) {
    const refreshToken = req.cookies?.refresh_token;
    const sessionId = req.cookies?.session_id;

    if (!refreshToken || !sessionId) {
      // sem cookies -> não tem refresh
      throw new Error('Refresh não encontrado.');
    }

    // valida refresh contra hash salvo na sessão
    const session = await this.authService.validateRefresh(
      sessionId,
      refreshToken,
    );

    // rotaciona refresh (mais seguro)
    const rotated = await this.authService.rotateSession(session.id);

    // gera novo access
    const accessToken = this.authService.signAccessToken({
      sub: session.user.id,
      email: session.user.email,
    });

    // gera novo csrf (boa prática junto com rotação)
    const csrfToken = randomToken(32);

    const refreshMaxAge = durationToMs(
      process.env.JWT_REFRESH_EXPIRES_IN ?? '7d',
    );
    res.cookie(
      'refresh_token',
      rotated.refreshToken,
      refreshCookieOptions(refreshMaxAge),
    );
    res.cookie('csrf_token', csrfToken, csrfCookieOptions(refreshMaxAge));

    return { accessToken, csrfToken };
  }

  @UseGuards(CsrfGuard)
  @Post('logout')
  async logout(
    @Req() req: any,
    @Res({ passthrough: true }) res: express.Response,
  ) {
    const sessionId = req.cookies?.session_id;

    if (sessionId) {
      await this.authService.revokeSession(sessionId);
    }

    // limpar cookies (encerra sessão no browser)
    res.clearCookie('refresh_token', { path: '/auth' });
    res.clearCookie('session_id', { path: '/auth' });
    res.clearCookie('csrf_token', { path: '/auth' });

    return { ok: true };
  }
}
