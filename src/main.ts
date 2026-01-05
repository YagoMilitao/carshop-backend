/* eslint-disable @typescript-eslint/no-floating-promises */
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  // Lê as origens permitidas do .env (ex: "http://localhost:5173,https://meusite.com")
  const allowedOrigins =
    process.env.CORS_ORIGIN?.split(',').map((s) => s.trim()) ?? [];

  // CORS restrito: só permite chamadas do(s) domínio(s) autorizado(s)
  app.enableCors({
    origin: allowedOrigins.length ? allowedOrigins : false,
    methods: ['GET', 'POST', 'PATCH', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  });
  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();
