import type { RequestHandler } from 'express';

// Aplica o authMiddleware apenas quando includeDrafts=true é solicitado; caso contrário, segue público.
export function buildRequireAuthForDraftsMiddleware(
  authMiddleware: RequestHandler,
): RequestHandler {
  return (request, response, next) => {
    if (request.query.includeDrafts === 'true') {
      authMiddleware(request, response, next);
      return;
    }

    next();
  };
}
