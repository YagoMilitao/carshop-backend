import { env } from '../infra/config/env';
import { WorkModel } from '../data/models/work.model';
import { CategoryModel } from '../data/models/category.model';
import { TagModel } from '../data/models/tag.model';
import { connectDatabase, disconnectDatabase } from '@/infra/database/mongoose';

async function run(): Promise<void> {
  await connectDatabase(env.mongoUri);

  await WorkModel.syncIndexes();
  await CategoryModel.syncIndexes();
  await TagModel.syncIndexes();

  console.log('Índices sincronizados com sucesso.');

  await disconnectDatabase();
}

void run();
