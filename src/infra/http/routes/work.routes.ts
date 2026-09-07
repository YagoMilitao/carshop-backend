import { Router, type Router as ExpressRouter } from 'express';
import { WorkController } from '../../../presentation/controllers/work.controller';
import { CommentController } from '../../../presentation/controllers/comment.controller';
import { CreateWorkUseCase } from '../../../usecase/create-work.use-case';
import { ListWorksUseCase } from '../../../usecase/list-works.use-case';
import { GetWorkBySlugUseCase } from '../../../usecase/get-work-by-slug.use-case';
import { CreateCommentUseCase } from '../../../usecase/create-comment.use-case';
import { ListApprovedCommentsUseCase } from '../../../usecase/list-approved-comments.use-case';
import type { WorkRepositoryPort } from '../../../core/domain/repositories/work.repository';
import type { CommentRepositoryPort } from '../../../core/domain/repositories/comment.repository';
import type { SessionStorePort } from '../../../core/domain/repositories/session-store.repository';
import type { TokenServicePort } from '../../../core/domain/application/Auth/token-service.port';
import { buildAuthMiddleware } from '../../presentation/middleware/auth.middleware';
import { buildRequireAuthForDraftsMiddleware } from '../../presentation/middleware/require-auth-for-drafts.middleware';

export function buildWorkRouter(
  workRepository: WorkRepositoryPort,
  commentRepository: CommentRepositoryPort,
  sessionStore: SessionStorePort,
  tokenService: TokenServicePort,
): ExpressRouter {
  const router = Router();

  const createWorkUseCase = new CreateWorkUseCase(workRepository);
  const listWorksUseCase = new ListWorksUseCase(workRepository);
  const getWorkBySlugUseCase = new GetWorkBySlugUseCase(workRepository);

  const createCommentUseCase = new CreateCommentUseCase(
    commentRepository,
    workRepository,
  );
  const listApprovedCommentsUseCase = new ListApprovedCommentsUseCase(
    commentRepository,
    workRepository,
  );

  const workController = new WorkController(
    createWorkUseCase,
    listWorksUseCase,
    getWorkBySlugUseCase,
  );

  const commentController = new CommentController(
    createCommentUseCase,
    listApprovedCommentsUseCase,
  );

  const authMiddleware = buildAuthMiddleware(sessionStore, tokenService);
  const requireAuthForDraftsMiddleware =
    buildRequireAuthForDraftsMiddleware(authMiddleware);

  /**
   * Público: lista works publicados. Quando includeDrafts=true, exige autenticação.
   */
  router.get('/', requireAuthForDraftsMiddleware, workController.list);

  /**
   * Privado: criação de work.
   */
  router.post('/', authMiddleware, workController.create);

  /**
   * Público: cria comentário pendente.
   */
  router.post('/:workId/comments', commentController.create);

  /**
   * Público: lista apenas comentários aprovados.
   */
  router.get('/:workId/comments', commentController.listApproved);

  /**
   * Público: busca um único work publicado e não removido pelo slug.
   */
  router.get('/:slug', workController.getBySlug);

  return router;
}
