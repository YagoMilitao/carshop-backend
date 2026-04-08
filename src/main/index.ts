import { env } from '../infra/config/env';
import { createApp } from '../infra/server';

/**
 * Inicializa o servidor HTTP da aplicação.
 *
 * Motivo:
 * manter o bootstrap centralizado
 * e tratar erros logo no início da execução.
 */
async function bootstrap(): Promise<void> {
  try {
    const app = createApp();

    await new Promise<void>((resolve) => {
      app.listen(env.port, () => {
        console.log(`✅ Servidor HTTP rodando em http://localhost:${env.port}`);
        resolve();
      });
    });
  } catch (error: unknown) {
    /**
     * Tratamos o erro como unknown para manter tipagem segura.
     * Só depois verificamos se é instância de Error.
     */
    if (error instanceof Error) {
      console.error('❌ Erro ao iniciar a aplicação:', error.message);
    } else {
      console.error('❌ Erro desconhecido ao iniciar a aplicação.');
    }

    process.exit(1);
  }
}

void bootstrap();
