import mongoose from 'mongoose';

/**
 * Conecta ao MongoDB.
 *
 * Motivo:
 * centralizar a conexão em um único ponto da infraestrutura
 * e facilitar manutenção futura.
 */
export async function connectDatabase(mongoUri: string): Promise<void> {
  if (!mongoUri || mongoUri.trim().length === 0) {
    throw new Error('MONGO_URI não foi informada.');
  }

  await mongoose.connect(mongoUri);

  console.log('✅ Conectado ao MongoDB com sucesso.');
}

/**
 * Fecha a conexão com o MongoDB.
 *
 * Útil para testes e shutdown controlado.
 */
export async function disconnectDatabase(): Promise<void> {
  await mongoose.disconnect();
}
