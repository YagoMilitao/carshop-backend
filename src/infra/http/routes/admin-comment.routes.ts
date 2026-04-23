import { Router, type Router as ExpressRouter } from 'express';
import type { SessionStorePort } from '../../../core/domain/repositories/session-store.repository';
import type { TokenServicePort } from '../../../core/domain/application/Auth/token-service.port';
import type { CommentRepositoryPort } from '../../../core/domain/repositories/comment.repository';
import { buildAuthMiddleware } from '../../presentation/middleware/auth.middleware';
import { AdminCommentController } from '../../../presentation/controllers/admin-comment.controller';
import { ApproveCommentUseCase } from '../../../usecase/approve-comment.use-case';
import { UpdateCommentUseCase } from '../../../usecase/update-comment.use-case';
import { DeleteCommentUseCase } from '../../../usecase/delete-comment.use-case';

/**
 * Rotas administrativas de moderação de comentários.
 *
 * Todas exigem autenticação do admin.
 */
export function buildAdminCommentRouter(
  commentRepository: CommentRepositoryPort,
  sessionStore: SessionStorePort,
  tokenService: TokenServicePort,
): ExpressRouter {
  const router = Router();

  const authMiddleware = buildAuthMiddleware(sessionStore, tokenService);

  const approveCommentUseCase = new ApproveCommentUseCase(commentRepository);
  const updateCommentUseCase = new UpdateCommentUseCase(commentRepository);
  const deleteCommentUseCase = new DeleteCommentUseCase(commentRepository);

  const controller = new AdminCommentController(
    approveCommentUseCase,
    updateCommentUseCase,
    deleteCommentUseCase,
  );

  /**
   * Aplica autenticação em todas as rotas abaixo.
   */
  router.use(authMiddleware);

  router.patch('/:commentId/approve', controller.approve);
  router.patch('/:commentId', controller.update);
  router.delete('/:commentId', controller.delete);

  return router;
}
