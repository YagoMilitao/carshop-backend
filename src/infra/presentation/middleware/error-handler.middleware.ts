import type { ErrorRequestHandler } from 'express';
import { HttpError } from '../../../core/domain/application/ApplicationError/http-error';

// Traduz exceções para o formato HTTP esperado pelo cliente.
export const errorHandlerMiddleware: ErrorRequestHandler = (
  error,
  _request,
  response,
) => {
  if (error instanceof HttpError) {
    response.status(error.statusCode).json({
      message: error.message,
      details: error.details,
    });
    return;
  }

  // Tratamento específico para JSON inválido no body parser do Express.
  if (error instanceof SyntaxError && 'body' in error) {
    response.status(400).json({
      message: 'JSON inválido no corpo da requisição.',
    });
    return;
  }

  // Mantém log do erro inesperado para investigação sem vazar stack ao cliente.
  console.error(error);
  response.status(500).json({
    message: 'Erro interno no servidor.',
  });
};
