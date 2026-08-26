import { mergeOpenApiPaths } from '../../../../src/infra/docs/swagger.merge';

describe('mergeOpenApiPaths', () => {
  it('mantém paths disjuntos de grupos diferentes (AC-007)', () => {
    const merged = mergeOpenApiPaths(
      { '/works': { get: { summary: 'list works' } } },
      { '/auth/login': { post: { summary: 'login' } } },
    );

    expect(merged).toEqual({
      '/works': { get: { summary: 'list works' } },
      '/auth/login': { post: { summary: 'login' } },
    });
  });

  it('combina métodos HTTP diferentes declarados para o mesmo path (AC-007)', () => {
    const merged = mergeOpenApiPaths(
      { '/works': { get: { summary: 'list works' } } },
      { '/works': { post: { summary: 'create work' } } },
    );

    expect(merged).toEqual({
      '/works': {
        get: { summary: 'list works' },
        post: { summary: 'create work' },
      },
    });
  });

  it('quando o mesmo método é declarado para o mesmo path, o grupo posterior sobrescreve o anterior (AC-007)', () => {
    const merged = mergeOpenApiPaths(
      { '/works': { get: { summary: 'first definition' } } },
      { '/works': { get: { summary: 'second definition' } } },
    );

    expect(merged).toEqual({
      '/works': { get: { summary: 'second definition' } },
    });
  });
});
