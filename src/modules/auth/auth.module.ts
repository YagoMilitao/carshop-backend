import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import type { StringValue } from 'ms';

function getJwtExpiresIn(): StringValue | number {
  const value = process.env.JWT_EXPIRES_IN;

  if (!value) return '1d';

  const asNumber = Number(value);
  if (!Number.isNaN(asNumber)) return asNumber;

  return value as StringValue;
}

@Module({
  imports: [
    JwtModule.register({
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
