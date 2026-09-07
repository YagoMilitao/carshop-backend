import { env } from '../infra/config/env';
import { WorkModel } from '../data/models/work.model';
import { CategoryModel } from '../data/models/category.model';
import { TagModel } from '../data/models/tag.model';
import { connectDatabase, disconnectDatabase } from '@/infra/database/mongoose';

async function run(): Promise<void> {
  try {
    await connectDatabase(env.mongoUri);

    await WorkModel.syncIndexes();
    await CategoryModel.syncIndexes();
    await TagModel.syncIndexes();

    console.log('Índices sincronizados com sucesso.');
  } catch (error: unknown) {
    console.error(
      'Erro ao sincronizar índices.',
      error instanceof Error ? error.message : 'erro desconhecido',
    );
    process.exitCode = 1;
  } finally {
    await disconnectDatabase();
  }
}

void run();
