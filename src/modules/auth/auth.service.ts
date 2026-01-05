import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';

@Injectable()
export class AuthService {
  constructor(private readonly jwtService: JwtService) {}

  validateAdmin(email: string, password: string) {
    const adminEmail = process.env.ADMIN_EMAIL;
    const adminPassword = process.env.ADMIN_PASSWORD;

    if (!adminEmail || !adminPassword) {
      throw new UnauthorizedException('Admin não configurado.');
    }

    const valid = email === adminEmail && password === adminPassword;

    if (!valid) {
      throw new UnauthorizedException('Credenciais inválidas.');
    }

    return { email };
  }

  async login(email: string) {
    const payload = { sub: email };
    return {
      accessToken: await this.jwtService.signAsync(payload),
    };
  }
}
