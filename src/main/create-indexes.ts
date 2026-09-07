import { env } from '../infra/config/env';
import {
  connectDatabase,
  disconnectDatabase,
} from '../infra/database/mongoose';
import { WorkModel } from '../data/models/work.model';
import { CategoryModel } from '../data/models/category.model';
import { TagModel } from '../data/models/tag.model';
import { CommentModel } from '../data/models/comment.model';
import { WorkImageModel } from '../data/models/work-image.model';
import { AdminUserModel } from '../data/models/admin-user.model';
import { AuthSessionModel } from '../data/models/auth-session.model';
import { PortfolioWorkModel } from '../data/models/portfolio-work';

/**
 * Todos os modelos Mongoose atualmente definidos no repositório (FR-003:
 * "para cada modelo Mongoose atualmente definido").
 *
 * Motivo:
 * o script cobre a superfície completa dos modelos, mesmo os ainda não
 * usados por rotas/use cases ativos, porque a operação é apenas aditiva
 * (nunca remove índices) e, portanto, segura de executar mesmo para
 * modelos hoje sem uso.
 */
const MODELS = [
  WorkModel,
  CategoryModel,
  TagModel,
  CommentModel,
  WorkImageModel,
  AdminUserModel,
  AuthSessionModel,
  PortfolioWorkModel,
] as const;

interface IndexPresenceEntry {
  readonly modelName: string;
  readonly fields: string;
  readonly present: boolean;
}

/**
 * Normaliza os nomes de campo de um índice para uma chave comparável,
 * ignorando direção/tipo do índice (1, -1, 'text', etc.).
 */
function normalizeIndexFieldNames(fields: Record<string, unknown>): string {
  return Object.keys(fields)
    .sort((left, right) => left.localeCompare(right))
    .join(',');
}

/**
 * Constrói, para um modelo, o relatório somente-leitura que cruza os
 * índices declarados no schema (fonte da verdade, via
 * `schema.indexes()`) contra os índices realmente presentes na coleção
 * (via `collection.indexes()`).
 *
 * Motivo:
 * nunca cria nem remove nada nesta etapa — apenas relata presença,
 * atendendo FR-003/FR-004 sem risco para FR-005/NFR-003.
 */
async function buildIndexPresenceReport(
  model: (typeof MODELS)[number],
): Promise<IndexPresenceEntry[]> {
  const declaredIndexes = model.schema.indexes();
  const actualIndexes = await model.collection.indexes();
  const actualFieldSets = new Set(
    actualIndexes.map((index) => normalizeIndexFieldNames(index.key)),
  );

  return declaredIndexes.map(([fields]) => {
    const normalizedFields = normalizeIndexFieldNames(
      fields as Record<string, unknown>,
    );

    return {
      modelName: model.modelName,
      fields: normalizedFields || '(sem campos)',
      present: actualFieldSets.has(normalizedFields),
    };
  });
}

async function run(): Promise<void> {
  try {
    await connectDatabase(env.mongoUri);

    const reportEntries: IndexPresenceEntry[] = [];

    for (const currentModel of MODELS) {
      // Aditivo apenas: nunca remove índices ausentes do schema atual
      // (ao contrário de `syncIndexes()`), atendendo FR-005/NFR-003.
      await currentModel.createIndexes();

      reportEntries.push(...(await buildIndexPresenceReport(currentModel)));
    }

    console.log(
      'Índices garantidos com sucesso (modo aditivo; nenhum índice removido).',
    );

    for (const entry of reportEntries) {
      console.log(
        `${entry.modelName} | campos: ${entry.fields} | presente: ${
          entry.present ? 'sim' : 'não'
        }`,
      );
    }
  } catch {
    // Mensagem fixa apenas: erros de conexão/índice podem embutir a
    // connection string na própria `.message` do driver, por isso o
    // conteúdo do erro nunca é logado aqui (NFR-001), mirando o
    // comportamento já testado deste script.
    console.error('Erro ao verificar/garantir índices.');
    process.exitCode = 1;
  } finally {
    await disconnectDatabase();
  }
}

void run();
