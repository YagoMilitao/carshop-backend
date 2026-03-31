import {
  Body,
  Controller,
  Get,
  Headers,
  Post,
  Req,
  Res,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { AuthService } from './auth.service';
import { clearAuthCookies, setAuthCookies } from './auth.cookies';
import { LoginDto } from './dto/login.dto';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  // Autentica o admin, cria a sessão e devolve o access token ao cliente.
  @Post('login')
  async login(@Body() dto: LoginDto, @Res({ passthrough: true }) res: Response) {
    this.authService.validateAdmin(dto.email, dto.password);

    const authResult = await this.authService.login(dto.email);
    setAuthCookies(res, authResult.refreshToken, authResult.csrfToken);

    return {
      accessToken: authResult.accessToken,
      sessionId: authResult.sessionId,
      tokenType: authResult.tokenType,
    };
  }

  // Renova a autenticação usando o refresh token em cookie e validação CSRF.
  @Post('refresh')
  async refresh(
    @Req() req: Request,
    @Headers('x-csrf-token') csrfToken: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    const authResult = await this.authService.refresh(req.headers.cookie, csrfToken);
    setAuthCookies(res, authResult.refreshToken, authResult.csrfToken);

    return {
      accessToken: authResult.accessToken,
      sessionId: authResult.sessionId,
      tokenType: authResult.tokenType,
    };
  }

  // Revoga a sessão atual e remove os cookies de autenticação do navegador.
  @Post('logout')
  logout(
    @Req() req: Request,
    @Headers('x-csrf-token') csrfToken: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = this.authService.logout(req.headers.cookie, csrfToken);
    clearAuthCookies(res);
    return result;
  }

  // Expõe um endpoint protegido para consultar a sessão autenticada atual.
  @Get('session')
  getSession(@Req() req: Request) {
    return this.authService.getSession(req.auth!.sessionId);
  }
}
