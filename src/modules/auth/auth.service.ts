import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';

@Injectable()
export class AuthService {
  constructor(private readonly jwtService: JwtService) {}

  /**
   * Valida o login do admin com base em credenciais do ambiente.
   * Motivo: ter autenticação funcional sem depender de banco nesta sprint.
   * Depois a gente troca para buscar o AdminUser no banco.
   */
  validateAdmin(email: string, password: string) {
    const adminEmail = process.env.ADMIN_EMAIL;
    const adminPassword = process.env.ADMIN_PASSWORD;

    if (!adminEmail || !adminPassword) {
      throw new UnauthorizedException('Admin não configurado.');
    }

    // Comparação simples: nessa fase, a senha está em texto no .env (MVP).
    // Na sprint do banco, vamos guardar hash no DB.
    const valid = email === adminEmail && password === adminPassword;

    if (!valid) {
      throw new UnauthorizedException('Credenciais inválidas.');
    }

    return { email };
  }

  /**
   * Gera JWT com payload mínimo.
   * Motivo: manter token leve e evitar expor dados sensíveis.
   */
  async login(email: string) {
    const payload = { sub: email };
    return {
      accessToken: await this.jwtService.signAsync(payload),
    };
  }
}
