import { randomUUID } from 'crypto';
import { expect, describe, it } from '@jest/globals';
import { CommentModel } from '../../../../src/data/models/comment.model';

function buildValidComment() {
  return {
    id: randomUUID(),
    workId: randomUUID(),
    authorName: 'Maria Silva',
    content: 'Ficou excelente o trabalho!',
  };
}

describe('CommentModel', () => {
  it('deve validar um comentário válido', async () => {
    const document = new CommentModel(buildValidComment());

    await expect(document.validate()).resolves.toBeUndefined();
    expect(document.status).toBe('PENDING');
  });

  it('deve rejeitar status inválido', async () => {
    const document = new CommentModel({
      ...buildValidComment(),
      status: 'REJECTED',
    });

    await expect(document.validate()).rejects.toThrow();
  });

  it('deve aceitar status APPROVED', async () => {
    const document = new CommentModel({
      ...buildValidComment(),
      status: 'APPROVED',
    });

    await expect(document.validate()).resolves.toBeUndefined();
  });

  it('deve exigir campos obrigatórios', async () => {
    const comment = buildValidComment();
    const withoutContent = { ...comment } as Partial<typeof comment>;
    delete withoutContent.content;
    const document = new CommentModel(withoutContent);

    await expect(document.validate()).rejects.toThrow();
  });

  it('deve definir índice único para id', () => {
    const idPath = CommentModel.schema.path('id') as {
      options?: { unique?: boolean };
    };

    expect(idPath.options?.unique).toBe(true);
  });
});
