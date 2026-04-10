import { env } from '../infra/config/env';
import { connectDatabase } from '../infra/database/mongoose';
import { createApp } from '../infra/server';

/**
 * Inicializa a aplicação:
 * 1. conecta no banco
 * 2. cria a aplicação Express
 * 3. sobe o servidor HTTP
 */
async function bootstrap(): Promise<void> {
  try {
    await connectDatabase(env.mongoUri);

    const app = createApp();

    await new Promise<void>((resolve) => {
      app.listen(env.port, () => {
        console.log(`✅ Servidor HTTP rodando em http://localhost:${env.port}`);
        resolve();
      });
    });
  } catch (error: unknown) {
    if (error instanceof Error) {
      console.error('❌ Erro ao iniciar a aplicação:', error.message);
    } else {
      console.error('❌ Erro desconhecido ao iniciar a aplicação.');
    }

    process.exit(1);
  }
}

void bootstrap();
