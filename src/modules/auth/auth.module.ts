import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import type { StringValue } from 'ms';

function getJwtExpiresIn(): StringValue | number {
  const value = process.env.JWT_EXPIRES_IN;

  if (!value) return '1d';

  // Se for um número como "3600", retorna number
  const asNumber = Number(value);
  if (!Number.isNaN(asNumber)) return asNumber;

  // Caso contrário, assume que é um formato aceito pelo ms, como "1d", "2h", "30m"
  return value as StringValue;
}

@Module({
  imports: [
    JwtModule.register({
      // Secret e exp vem do .env (mais seguro e configurável)
      secret: process.env.JWT_SECRET,
      signOptions: {
        expiresIn: getJwtExpiresIn(),
      },
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService],
})
export class AuthModule {}
