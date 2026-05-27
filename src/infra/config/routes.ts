import type { Express } from 'express';
import type { AuthService } from '../../core/domain/application/Auth/auth.service';
import type { TokenServicePort } from '../../core/domain/application/Auth/token-service.port';
import type { SessionStorePort } from '../../core/domain/repositories/session-store.repository';
import type { WorkRepositoryPort } from '../../core/domain/repositories/work.repository';
import { buildAuthRouter } from '../http/routes/auth.routes';
import { buildWorkRouter } from '../http/routes/work.routes';
import { CommentRepositoryPort } from '@/core/domain/repositories/comment.repository';
import { buildAdminCommentRouter } from '../http/routes/admin-comment.routes';

/**
 * Dependências necessárias para registrar as rotas HTTP.
 *
 * Motivo:
 * deixar explícito tudo o que a camada HTTP precisa receber
 * da composição da aplicação.
 */
interface RegisterRoutesDependencies {
  authService: AuthService;
  sessionStore: SessionStorePort;
  tokenService: TokenServicePort;
  workRepository: WorkRepositoryPort;
  commentRepository: CommentRepositoryPort;
}

/**
 * Registra as rotas principais da aplicação.
 *
 * Motivo:
 * centralizar a composição das rotas em um único ponto
 * e evitar espalhar app.use(...) pelo projeto.
 */
export function registerRoutes(
  app: Express,
  dependencies: RegisterRoutesDependencies,
): void {
  /**
   * Rota simples de health check.
   *
   * Motivo:
   * útil para saber rapidamente se a API está no ar
   * e também ajuda em deploy futuro.
   */
  app.get('/', (_request, response) => {
    response.status(200).send('Hello World!');
  });

  /**
   * Rotas de autenticação.
   */
  app.use(
    '/auth',
    buildAuthRouter(
      dependencies.authService,
      dependencies.sessionStore,
      dependencies.tokenService,
    ),
  );

  /**
   * Rotas de works do portfólio.
   *
   * Motivo:
   * essa parte expõe o CRUD/listagem dos trabalhos.
   */
  app.use(
    '/works',
    buildWorkRouter(
      dependencies.workRepository,
      dependencies.commentRepository,
      dependencies.sessionStore,
      dependencies.tokenService,
    ),
  );

  /**
   * Rotas administrativas de comentários.
   */
  app.use(
    '/admin/comments',
    buildAdminCommentRouter(
      dependencies.commentRepository,
      dependencies.sessionStore,
      dependencies.tokenService,
    ),
  );
}
