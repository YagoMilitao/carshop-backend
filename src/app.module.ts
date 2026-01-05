import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import { AuthModule } from './modules/auth/auth.module';

@Module({
  imports: [
    // isGlobal: true permite acessar process.env em qualquer lugar sem reimportar
    ConfigModule.forRoot({ isGlobal: true }),
    // Rate limit global: protege contra spam e flood
    ThrottlerModule.forRoot([
      {
        ttl: 60_000, // janela de 60 segundos
        limit: 120, // 120 requests por minuto por IP
      },
    ]),
    AuthModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
