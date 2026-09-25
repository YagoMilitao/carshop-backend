import {
  adminWorksPaths,
  adminWorksSchemas,
} from '../../../../src/infra/docs/admin-works.swagger';

describe('adminWorksSchemas', () => {
  it('documenta UpdateWorkRequest como objeto não vazio e fechado', () => {
    expect(adminWorksSchemas.UpdateWorkRequest).toMatchObject({
      type: 'object',
      minProperties: 1,
      additionalProperties: false,
    });
  });

  it('documenta o limite de 120 caracteres de category', () => {
    expect(
      adminWorksSchemas.UpdateWorkRequest.properties.category,
    ).toMatchObject({ maxLength: 120 });
  });
});

describe('adminWorksPaths — POST /admin/works/{workId}/images (CARSHOP-156 AC-011)', () => {
  const uploadResponses =
    adminWorksPaths['/admin/works/{workId}/images'].post.responses;

  it('documenta 400, 413, 415, 500 e 502', () => {
    expect(Object.keys(uploadResponses)).toEqual(
      expect.arrayContaining(['400', '413', '415', '500', '502']),
    );
  });

  it('documenta as categorias específicas de 400 e a falha do storage externo em 502', () => {
    expect(uploadResponses['400'].description).toContain(
      'campo de arquivo inesperado',
    );
    expect(uploadResponses['400'].description).toContain('mais de uma imagem');
    expect(uploadResponses['400'].description).toContain(
      'corpo multipart malformado',
    );
    expect(uploadResponses['502'].description).toBe(
      'Falha ao enviar a imagem para o armazenamento externo.',
    );
  });
});
