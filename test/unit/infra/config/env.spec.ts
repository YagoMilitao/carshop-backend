describe('env — WORK_HARD_DELETE_AFTER_DAYS (FR-005, AC-009, AC-010)', () => {
  const originalEnv = process.env;

  const REQUIRED_ENV = {
    MONGO_URI: 'mongodb://unit-test',
    JWT_SECRET: 'unit-test-secret',
    ADMIN_EMAIL: 'admin@example.com',
    ADMIN_PASSWORD: 'unit-test-password',
    NODE_ENV: 'test',
  };

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv, ...REQUIRED_ENV };
    delete process.env.WORK_HARD_DELETE_AFTER_DAYS;
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('usa o padrão de 90 dias quando a variável não está definida (AC-009)', () => {
    delete process.env.WORK_HARD_DELETE_AFTER_DAYS;

    let loadedEnv: { workHardDeleteAfterDays: number } | undefined;

    jest.isolateModules(() => {
      loadedEnv = require('../../../../src/infra/config/env').env;
    });

    expect(loadedEnv?.workHardDeleteAfterDays).toBe(90);
  });

  it('usa o valor configurado quando é um inteiro positivo válido (AC-010)', () => {
    process.env.WORK_HARD_DELETE_AFTER_DAYS = '30';

    let loadedEnv: { workHardDeleteAfterDays: number } | undefined;

    jest.isolateModules(() => {
      loadedEnv = require('../../../../src/infra/config/env').env;
    });

    expect(loadedEnv?.workHardDeleteAfterDays).toBe(30);
  });

  it.each(['0', '-5', 'abc', '1.5'])(
    'falha rapidamente quando o valor configurado é inválido (%p)',
    (invalidValue) => {
      process.env.WORK_HARD_DELETE_AFTER_DAYS = invalidValue;

      expect(() => {
        jest.isolateModules(() => {
          require('../../../../src/infra/config/env');
        });
      }).toThrow(
        'A variável "WORK_HARD_DELETE_AFTER_DAYS" precisa ser um número inteiro positivo.',
      );
    },
  );
});
