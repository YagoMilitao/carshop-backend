import type { RequestHandler } from 'express';

// Resposta padrão para qualquer rota não mapeada na API.
export const notFoundMiddleware: RequestHandler = (_request, response) => {
  response.status(404).json({
    message: 'Rota não encontrada.',
  });
};
