import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';

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
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
