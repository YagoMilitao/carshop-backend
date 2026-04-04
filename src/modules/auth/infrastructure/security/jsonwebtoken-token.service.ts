import { randomUUID } from 'node:crypto';
import { sign, verify, type SignOptions } from 'jsonwebtoken';
import {
  getAccessTokenExpiresIn,
  getJwtSecret,
  getRefreshTokenExpiresIn,
} from '../../auth.config';
import type {
  SignTokenInput,
  TokenServicePort,
} from '../../domain/ports/token-service.port';
import type { JwtPayload } from '../../domain/types/auth.types';
import { HttpError } from '../../../../shared/errors/http-error';

// Adapter de JWT baseado em jsonwebtoken para assinar e validar tokens.
export class JsonWebTokenService implements TokenServicePort {
  sign(payload: SignTokenInput) {
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
      { expiresIn: expiresIn as SignOptions['expiresIn'] },
    );
  }

  verify(token: string): JwtPayload {
    try {
      const decoded = verify(token, getJwtSecret());

      if (!decoded || typeof decoded === 'string') {
        throw new HttpError(401, 'Token inválido ou expirado.');
      }

      const payload = decoded as Partial<JwtPayload>;
      const tokenType = payload.type;
      const isValidType = tokenType === 'access' || tokenType === 'refresh';

      if (
        typeof payload.sub !== 'string' ||
        typeof payload.sid !== 'string' ||
        !isValidType
      ) {
        throw new HttpError(401, 'Token inválido ou expirado.');
      }

      return {
        sub: payload.sub,
        sid: payload.sid,
        type: tokenType,
        jti: payload.jti,
        iat: payload.iat,
        exp: payload.exp,
      };
    } catch (error) {
      if (error instanceof HttpError) throw error;
      throw new HttpError(401, 'Token inválido ou expirado.');
    }
  }
}
