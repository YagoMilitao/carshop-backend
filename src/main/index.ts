import 'dotenv/config';
import { createApp } from '../infra/server';

// Inicializa o servidor HTTP Node com a aplicação Express já configurada.
async function bootstrap() {
  const app = createApp();
  const port = Number(process.env.PORT ?? 3000);

  await new Promise<void>((resolve) => {
    app.listen(port, () => {
      console.log(`Servidor HTTP rodando em http://localhost:${port}`);
      resolve();
    });
  });
}

void bootstrap();
