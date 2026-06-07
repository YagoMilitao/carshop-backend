import type { Express } from 'express';

import type { AuthService } from '../../core/domain/application/Auth/auth.service';
import type { TokenServicePort } from '../../core/domain/application/Auth/token-service.port';
import type { ImageStoragePort } from '../../core/domain/application/Storage/image-storage.port';

import type { SessionStorePort } from '../../core/domain/repositories/session-store.repository';
import type { WorkRepositoryPort } from '../../core/domain/repositories/work.repository';
import type { CommentRepositoryPort } from '../../core/domain/repositories/comment.repository';

import { buildAuthRouter } from '../http/routes/auth.routes';
import { buildWorkRouter } from '../http/routes/work.routes';
import { buildAdminCommentRouter } from '../http/routes/admin-comment.routes';
import { buildWorkImageRouter } from '../http/routes/work-image.routes';

/**
 * Dependências necessárias para registrar todas as rotas.
 *
 * Motivo:
 * deixar explícito tudo que a camada HTTP precisa receber
 * da composição principal da aplicação.
 */
interface RegisterRoutesDependencies {
  authService: AuthService;
  sessionStore: SessionStorePort;
  tokenService: TokenServicePort;
  workRepository: WorkRepositoryPort;
  commentRepository: CommentRepositoryPort;
  imageStorage: ImageStoragePort;
}

/**
 * Registra as rotas principais da API.
 */
export function registerRoutes(
  app: Express,
  dependencies: RegisterRoutesDependencies,
): void {
  /**
   * Health check simples.
   */
  app.get('/', (_request, response) => {
    response.status(200).send('Hello World!');
  });

  /**
   * Rotas de autenticação.
   *
   * Base:
   * /auth/login
   * /auth/refresh
   * /auth/logout
   * /auth/session
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
   * Rotas públicas e privadas de works.
   *
   * Base:
   * GET  /works
   * POST /works
   * POST /works/:workId/comments
   * GET  /works/:workId/comments
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
   *
   * Base:
   * PATCH  /admin/comments/:commentId/approve
   * PATCH  /admin/comments/:commentId
   * DELETE /admin/comments/:commentId
   */
  app.use(
    '/admin/comments',
    buildAdminCommentRouter(
      dependencies.commentRepository,
      dependencies.sessionStore,
      dependencies.tokenService,
    ),
  );

  /**
   * Rotas administrativas de imagens dos works.
   *
   * Base:
   * POST /admin/works/:workId/images
   */
  app.use(
    '/admin/works',
    buildWorkImageRouter(
      dependencies.workRepository,
      dependencies.imageStorage,
      dependencies.sessionStore,
      dependencies.tokenService,
    ),
  );
}
