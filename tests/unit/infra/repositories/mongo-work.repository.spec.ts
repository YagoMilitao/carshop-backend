import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { MongoWorkRepository } from '../../../../src/infra/repositories/mongo-work.repository';
import { WorkModel } from '../../../../src/data/models/work.model';

describe('MongoWorkRepository', () => {
  let mongo: MongoMemoryServer;
  let repository: MongoWorkRepository;

  beforeAll(async () => {
    mongo = await MongoMemoryServer.create();
    await mongoose.connect(mongo.getUri());
  });

  beforeEach(async () => {
    repository = new MongoWorkRepository();
    await WorkModel.deleteMany({});
  });

  afterAll(async () => {
    await mongoose.disconnect();
    await mongo.stop();
  });

  it('deve criar um work', async () => {
    const work = await repository.create({
      slug: 'teste-work',
      title: 'Teste Work',
      description: 'Descrição teste',
      category: 'bancos',
      tags: ['Couro', 'Civic'],
      status: 'published',
    });

    expect(work.id).toBeDefined();
    expect(work.slug).toBe('teste-work');
    expect(work.status).toBe('published');
  });

  it('deve listar apenas works publicados', async () => {
    await repository.create({
      slug: 'publicado',
      title: 'Publicado',
      description: 'Descrição',
      category: 'bancos',
      tags: [],
      status: 'published',
    });

    await repository.create({
      slug: 'rascunho',
      title: 'Rascunho',
      description: 'Descrição',
      category: 'bancos',
      tags: [],
      status: 'draft',
    });

    const works = await repository.listPublished();

    expect(works).toHaveLength(1);
    expect(works[0].slug).toBe('publicado');
  });

  it('deve aplicar soft delete', async () => {
    const work = await repository.create({
      slug: 'soft-delete',
      title: 'Soft Delete',
      description: 'Descrição',
      category: 'bancos',
      tags: [],
      status: 'published',
    });

    await repository.softDelete(work.id);

    const found = await repository.findById(work.id);

    expect(found).toBeUndefined();
  });

  it('deve fazer hard delete', async () => {
    const work = await repository.create({
      slug: 'hard-delete',
      title: 'Hard Delete',
      description: 'Descrição',
      category: 'bancos',
      tags: [],
      status: 'published',
    });

    await repository.hardDelete(work.id);

    const exists = await WorkModel.findOne({ id: work.id });

    expect(exists).toBeNull();
  });
});
