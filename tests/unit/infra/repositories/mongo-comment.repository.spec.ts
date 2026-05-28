import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { MongoCommentRepository } from '../../../../src/infra/repositories/mongo-comment.repository';
import { CommentModel } from '../../../../src/data/models/comment.model';

describe('MongoCommentRepository', () => {
  let mongo: MongoMemoryServer;
  let repository: MongoCommentRepository;

  beforeAll(async () => {
    mongo = await MongoMemoryServer.create();
    await mongoose.connect(mongo.getUri());
  });

  beforeEach(async () => {
    repository = new MongoCommentRepository();
    await CommentModel.deleteMany({});
  });

  afterAll(async () => {
    await mongoose.disconnect();
    await mongo.stop();
  });

  it('deve criar comentário como PENDING', async () => {
    const comment = await repository.createPending({
      workId: 'work-1',
      authorName: 'Yago',
      content: 'Muito bom.',
    });

    expect(comment.id).toBeDefined();
    expect(comment.status).toBe('PENDING');
  });

  it('deve listar apenas comentários APPROVED', async () => {
    const pending = await repository.createPending({
      workId: 'work-1',
      authorName: 'Yago',
      content: 'Pendente',
    });

    await repository.createPending({
      workId: 'work-1',
      authorName: 'João',
      content: 'Também pendente',
    });

    await repository.update(pending.id, {
      status: 'APPROVED',
    });

    const comments = await repository.listApprovedByWorkId('work-1');

    expect(comments).toHaveLength(1);
    expect(comments[0].status).toBe('APPROVED');
  });

  it('deve atualizar comentário', async () => {
    const comment = await repository.createPending({
      workId: 'work-1',
      authorName: 'Yago',
      content: 'Original',
    });

    const updated = await repository.update(comment.id, {
      content: 'Atualizado',
    });

    expect(updated?.content).toBe('Atualizado');
  });

  it('deve deletar comentário', async () => {
    const comment = await repository.createPending({
      workId: 'work-1',
      authorName: 'Yago',
      content: 'Será deletado',
    });

    await repository.deleteById(comment.id);

    const found = await repository.findById(comment.id);

    expect(found).toBeUndefined();
  });
});
