import type { ErrorRequestHandler } from 'express';
import { HttpError } from '../../../core/domain/application/ApplicationError/http-error';

type PayloadTooLargeError = Error & {
  type?: string;
  statusCode?: number;
  status?: number;
};

function isPayloadTooLargeError(
  error: unknown,
): error is PayloadTooLargeError {
  if (!(error instanceof Error)) {
    return false;
  }
  const candidate = error as PayloadTooLargeError;
  return (
    candidate.type === 'entity.too.large' &&
    (candidate.statusCode === 413 || candidate.status === 413)
  );
}

// Traduz exceções para o formato HTTP esperado pelo cliente.
export const errorHandlerMiddleware: ErrorRequestHandler = (
  error,
  _request,
  response,
  _next,
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

  // Tratamento específico para corpo de requisição acima do limite configurado.
  if (isPayloadTooLargeError(error)) {
    response.status(413).json({
      message: 'Corpo da requisição excede o limite permitido.',
    });
    return;
  }

  // Mantém log do erro inesperado para investigação sem vazar stack ao cliente.
  console.error(error);
  response.status(500).json({
    message: 'Erro interno no servidor.',
  });
};
