/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import {
  Injectable,
  NestMiddleware,
  UnauthorizedException,
} from '@nestjs/common';
import jwt from 'jsonwebtoken';

/**
 * Middleware que valida o Access Token (JWT) enviado no header Authorization.
 * Motivo: centralizar a leitura do token e anexar req.user.
 */
@Injectable()
export class AuthMiddleware implements NestMiddleware {
  use(req: any, _res: any, next: () => void) {
    const authHeader: string | undefined = req.headers['authorization'];
    if (!authHeader) return next(); // sem token -> segue (rotas públicas continuam públicas)

    const [type, token] = authHeader.split(' ');
    if (type !== 'Bearer' || !token) return next();

    const secret = process.env.JWT_SECRET;
    if (!secret) throw new Error('JWT_SECRET não configurado.');

    try {
      const payload = jwt.verify(token, secret) as any;
      req.user = payload; // ex: { sub, email, iat, exp }
      return next();
    } catch {
      // Token inválido: você pode escolher ignorar ou bloquear.
      // Para segurança, bloqueamos se mandou token inválido.
      throw new UnauthorizedException('Token inválido.');
    }
  }
}
