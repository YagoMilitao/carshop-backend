import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import { env } from '../config/env';

/**
 * Criamos a instância principal do Express.
 * Ela será configurada com middlewares e rotas.
 */
export const app = express();

/**
 * helmet:
 * adiciona headers de segurança HTTP automaticamente.
 * Motivo:
 * melhora a segurança básica da aplicação.
 */
app.use(helmet());

/**
 * cors:
 * permite controlar quais origens podem consumir a API no navegador.
 * Aqui estamos restringindo para o frontend configurado.
 */
app.use(
  cors({
    origin: env.frontendUrl,
    credentials: true,
  }),
);

/**
 * express.json():
 * permite que a API entenda JSON no body das requisições.
 */
app.use(express.json());

/**
 * morgan:
 * gera logs HTTP no terminal.
 * Motivo:
 * ajuda a enxergar rapidamente método, rota e status.
 */
app.use(morgan('dev'));

/**
 * Rota de health check simples.
 * Motivo:
 * verificar se a API está de pé.
 */
app.get('/health', (_request, response) => {
  return response.status(200).json({
    status: 'ok',
    message: 'CarShop backend está rodando',
  });
});
