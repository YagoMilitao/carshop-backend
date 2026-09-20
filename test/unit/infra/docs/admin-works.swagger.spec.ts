import { adminWorksSchemas } from '../../../../src/infra/docs/admin-works.swagger';

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
