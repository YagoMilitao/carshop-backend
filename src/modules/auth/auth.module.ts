import { MiddlewareConsumer, Module, NestModule, RequestMethod } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { SessionStoreService } from './session-store.service';
import { AuthMiddleware } from './middlewares/auth.middleware';
import { CsrfProtectionMiddleware } from './middlewares/csrf-protection.middleware';

@Module({
  controllers: [AuthController],
  providers: [
    AuthService,
    SessionStoreService,
    AuthMiddleware,
    CsrfProtectionMiddleware,
  ],
})
export class AuthModule implements NestModule {
  // Aplica os middlewares apenas nas rotas que precisam de CSRF ou JWT.
  configure(consumer: MiddlewareConsumer) {
    consumer
      .apply(CsrfProtectionMiddleware)
      .forRoutes(
        { path: 'auth/refresh', method: RequestMethod.POST },
        { path: 'auth/logout', method: RequestMethod.POST },
      );

    consumer
      .apply(AuthMiddleware)
      .forRoutes({ path: 'auth/session', method: RequestMethod.GET });
  }
}
