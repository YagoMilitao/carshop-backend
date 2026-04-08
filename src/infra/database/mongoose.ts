import mongoose from 'mongoose';
import { env } from '../config/env';

/**
 * Esta função centraliza a conexão com o MongoDB Atlas.
 * Motivo:
 * - isolar a responsabilidade da conexão
 * - facilitar manutenção
 * - evitar conexão espalhada pela aplicação
 */
export async function connectMongo(): Promise<void> {
  await mongoose.connect(env.mongoUri);
  console.log('✅ MongoDB conectado com sucesso');
}
