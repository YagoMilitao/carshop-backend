import type { Environment } from '../../../../src/infra/config/env';

/**
 * Carrega o módulo `env` de forma isolada e retorna o `env` exportado.
 * Usado pelos cenários de "não deve bloquear o startup" (CARSHOP-110).
 */
function loadEnvModule(): Environment {
  let loadedEnv: Environment | undefined;

  jest.isolateModules(() => {
    loadedEnv = (
      require('../../../../src/infra/config/env') as { env: Environment }
    ).env;
  });

  return loadedEnv as Environment;
}

/**
 * Carrega o módulo `env` de forma isolada esperando que o carregamento
 * lance um erro, e retorna esse erro para inspeção da mensagem.
 * Usado pelos cenários de rejeição de configuração fraca (CARSHOP-110).
 */
function captureEnvLoadError(): Error {
  let thrown: unknown;

  try {
    jest.isolateModules(() => {
      require('../../../../src/infra/config/env');
    });
  } catch (error) {
    thrown = error;
  }

  expect(thrown).toBeInstanceOf(Error);

  return thrown as Error;
}

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

describe('env — TRUST_PROXY_HOPS (CARSHOP-108, FR-007, AC-005)', () => {
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
    delete process.env.TRUST_PROXY_HOPS;
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('usa o padrão seguro de 0 hops quando a variável não está definida', () => {
    let loadedEnv: { trustProxyHops: number } | undefined;

    jest.isolateModules(() => {
      loadedEnv = require('../../../../src/infra/config/env').env;
    });

    expect(loadedEnv?.trustProxyHops).toBe(0);
  });

  it('usa o valor configurado quando é um inteiro válido (>= 0)', () => {
    process.env.TRUST_PROXY_HOPS = '2';

    let loadedEnv: { trustProxyHops: number } | undefined;

    jest.isolateModules(() => {
      loadedEnv = require('../../../../src/infra/config/env').env;
    });

    expect(loadedEnv?.trustProxyHops).toBe(2);
  });

  it('aceita 0 hops (nenhum proxy confiável)', () => {
    process.env.TRUST_PROXY_HOPS = '0';

    let loadedEnv: { trustProxyHops: number } | undefined;

    jest.isolateModules(() => {
      loadedEnv = require('../../../../src/infra/config/env').env;
    });

    expect(loadedEnv?.trustProxyHops).toBe(0);
  });

  it.each(['-1', 'abc', '1.5'])(
    'falha rapidamente quando o valor configurado é inválido (%p)',
    (invalidValue) => {
      process.env.TRUST_PROXY_HOPS = invalidValue;

      expect(() => {
        jest.isolateModules(() => {
          require('../../../../src/infra/config/env');
        });
      }).toThrow(
        'A variável "TRUST_PROXY_HOPS" precisa ser um número inteiro maior ou igual a zero.',
      );
    },
  );
});

describe('env — JWT_SECRET strength in production (FR-001, AC-001, AC-002, AC-010, AC-011)', () => {
  const originalEnv = process.env;

  /**
   * Ambiente de produção plenamente compatível com todas as demais
   * validações (senha, CORS, durações), de forma que apenas a força do
   * JWT_SECRET esteja sob teste em cada cenário.
   */
  const VALID_PRODUCTION_ENV = {
    NODE_ENV: 'production',
    MONGO_URI: 'mongodb://prod-unit-test',
    CORS_ORIGIN: 'https://app.example.com',
    JWT_SECRET: 'a'.repeat(32),
    JWT_EXPIRES_IN: '15m',
    JWT_REFRESH_EXPIRES_IN: '7d',
    ADMIN_EMAIL: 'admin@example.com',
    ADMIN_PASSWORD: 'Str0ng!Passw0rd',
  };

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv, ...VALID_PRODUCTION_ENV };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('rejeita JWT_SECRET com menos de 32 caracteres em produção (AC-001)', () => {
    const weakSecret = 'a'.repeat(31);
    process.env.JWT_SECRET = weakSecret;

    const error = captureEnvLoadError();

    expect(error.message).toContain('JWT_SECRET');
    expect(error.message).not.toContain(weakSecret);
  });

  it('aceita JWT_SECRET com 32 ou mais caracteres em produção (AC-002)', () => {
    const strongSecret = 'a'.repeat(32);
    process.env.JWT_SECRET = strongSecret;

    const loadedEnv = loadEnvModule();

    expect(loadedEnv.jwtSecret).toBe(strongSecret);
  });

  it('não bloqueia o startup com JWT_SECRET curto em NODE_ENV=test (AC-010)', () => {
    process.env = {
      ...originalEnv,
      NODE_ENV: 'test',
      MONGO_URI: 'mongodb://unit-test',
      JWT_SECRET: 'short',
      ADMIN_EMAIL: 'admin@example.com',
      ADMIN_PASSWORD: 'weak',
    };

    const loadedEnv = loadEnvModule();

    expect(loadedEnv.jwtSecret).toBe('short');
  });

  it('não bloqueia o startup com JWT_SECRET curto em NODE_ENV=development (AC-010)', () => {
    process.env = {
      ...originalEnv,
      NODE_ENV: 'development',
      MONGO_URI: 'mongodb://unit-test',
      JWT_SECRET: 'short',
      ADMIN_EMAIL: 'admin@example.com',
      ADMIN_PASSWORD: 'weak',
    };

    const loadedEnv = loadEnvModule();

    expect(loadedEnv.jwtSecret).toBe('short');
  });
});

describe('env — ADMIN_PASSWORD policy in production (FR-002, AC-003, AC-005, AC-010, AC-011)', () => {
  const originalEnv = process.env;

  const VALID_PRODUCTION_ENV = {
    NODE_ENV: 'production',
    MONGO_URI: 'mongodb://prod-unit-test',
    CORS_ORIGIN: 'https://app.example.com',
    JWT_SECRET: 'a'.repeat(32),
    JWT_EXPIRES_IN: '15m',
    JWT_REFRESH_EXPIRES_IN: '7d',
    ADMIN_EMAIL: 'admin@example.com',
    ADMIN_PASSWORD: 'Str0ng!Passw0rd',
  };

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv, ...VALID_PRODUCTION_ENV };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('rejeita ADMIN_PASSWORD muito curta em produção (AC-003)', () => {
    const shortPassword = 'Sh0rt!Pw';
    process.env.ADMIN_PASSWORD = shortPassword;

    const error = captureEnvLoadError();

    expect(error.message).toContain('ADMIN_PASSWORD');
    expect(error.message).not.toContain(shortPassword);
  });

  it('rejeita ADMIN_PASSWORD sem uma classe de caractere exigida (sem símbolo) em produção (AC-003)', () => {
    const noSymbolPassword = 'StrongPassw0rd'; // gitleaks:allow (fictitious test fixture, not a real credential)
    process.env.ADMIN_PASSWORD = noSymbolPassword;

    const error = captureEnvLoadError();

    expect(error.message).toContain('ADMIN_PASSWORD');
    expect(error.message).not.toContain(noSymbolPassword);
  });

  it('aceita ADMIN_PASSWORD que atende à política completa em produção (AC-005)', () => {
    const compliantPassword = 'Str0ng!Passw0rd';
    process.env.ADMIN_PASSWORD = compliantPassword;

    const loadedEnv = loadEnvModule();

    expect(loadedEnv.adminPassword).toBe(compliantPassword);
  });

  it('não bloqueia o startup com ADMIN_PASSWORD fraca em NODE_ENV=test (AC-010)', () => {
    process.env = {
      ...originalEnv,
      NODE_ENV: 'test',
      MONGO_URI: 'mongodb://unit-test',
      JWT_SECRET: 'unit-test-secret',
      ADMIN_EMAIL: 'admin@example.com',
      ADMIN_PASSWORD: 'weak',
    };

    const loadedEnv = loadEnvModule();

    expect(loadedEnv.adminPassword).toBe('weak');
  });
});

describe('env — ADMIN_PASSWORD denylist in production (FR-003, AC-004, AC-011)', () => {
  const originalEnv = process.env;

  const VALID_PRODUCTION_ENV = {
    NODE_ENV: 'production',
    MONGO_URI: 'mongodb://prod-unit-test',
    CORS_ORIGIN: 'https://app.example.com',
    JWT_SECRET: 'a'.repeat(32),
    JWT_EXPIRES_IN: '15m',
    JWT_REFRESH_EXPIRES_IN: '7d',
    ADMIN_EMAIL: 'admin@example.com',
    ADMIN_PASSWORD: 'Str0ng!Passw0rd',
  };

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv, ...VALID_PRODUCTION_ENV };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it.each(['ChangeMe', ' changeme ', 'ADMIN123', 'Qwerty'])(
    'rejeita ADMIN_PASSWORD com valor na lista de negação (case/trim variant: %p) em produção (AC-004)',
    (denylistedValue) => {
      process.env.ADMIN_PASSWORD = denylistedValue;

      const error = captureEnvLoadError();

      expect(error.message).toContain('ADMIN_PASSWORD');
      expect(error.message).not.toContain(denylistedValue);
    },
  );

  it('rejeita ADMIN_PASSWORD que atende à política de caracteres mas está na lista de negação (AC-004)', () => {
    const policyCompliantButDenylisted = 'Password123!';
    process.env.ADMIN_PASSWORD = policyCompliantButDenylisted;

    const error = captureEnvLoadError();

    expect(error.message).toContain('ADMIN_PASSWORD');
    expect(error.message).not.toContain(policyCompliantButDenylisted);
  });
});

describe('env — Duration validation for JWT_EXPIRES_IN / JWT_REFRESH_EXPIRES_IN (FR-004, AC-006, AC-007, AC-011)', () => {
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
    delete process.env.JWT_EXPIRES_IN;
    delete process.env.JWT_REFRESH_EXPIRES_IN;
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('rejeita JWT_EXPIRES_IN não-parseável mesmo em NODE_ENV=test (AC-006)', () => {
    process.env.JWT_EXPIRES_IN = 'abc';

    const error = captureEnvLoadError();

    expect(error.message).toContain('JWT_EXPIRES_IN');
    expect(error.message).not.toContain('abc');
  });

  it('rejeita JWT_REFRESH_EXPIRES_IN não-parseável mesmo em NODE_ENV=test (AC-006)', () => {
    process.env.JWT_REFRESH_EXPIRES_IN = 'abc';

    const error = captureEnvLoadError();

    expect(error.message).toContain('JWT_REFRESH_EXPIRES_IN');
    expect(error.message).not.toContain('abc');
  });

  it.each([
    ['JWT_EXPIRES_IN', ' 15m'],
    ['JWT_EXPIRES_IN', '15m '],
    ['JWT_REFRESH_EXPIRES_IN', ' 7d '],
  ])('rejeita %s com espaços nas extremidades', (name, value) => {
    process.env[name] = value;

    const error = captureEnvLoadError();

    expect(error.message).toContain(name);
    expect(error.message).not.toContain(value);
  });

  it.each([
    ['JWT_EXPIRES_IN', '1ms'],
    ['JWT_EXPIRES_IN', '999ms'],
    ['JWT_REFRESH_EXPIRES_IN', '500ms'],
  ])('rejeita %s inferior a um segundo', (name, value) => {
    process.env[name] = value;

    const error = captureEnvLoadError();

    expect(error.message).toContain(name);
    expect(error.message).not.toContain(value);
  });

  it.each(['1s', '1000ms'])(
    'aceita JWT_EXPIRES_IN no limite mínimo: %s',
    (value) => {
      process.env.JWT_EXPIRES_IN = value;

      const loadedEnv = loadEnvModule();

      expect(loadedEnv.jwtExpiresIn).toBe(value);
    },
  );

  it('rejeita JWT_EXPIRES_IN acima do teto de 1 hora (AC-007)', () => {
    process.env.JWT_EXPIRES_IN = '2h';

    const error = captureEnvLoadError();

    expect(error.message).toContain('JWT_EXPIRES_IN');
    expect(error.message).not.toContain('2h');
  });

  it('rejeita JWT_REFRESH_EXPIRES_IN acima do teto de 30 dias (AC-007)', () => {
    process.env.JWT_REFRESH_EXPIRES_IN = '31d';

    const error = captureEnvLoadError();

    expect(error.message).toContain('JWT_REFRESH_EXPIRES_IN');
    expect(error.message).not.toContain('31d');
  });

  it('aceita JWT_EXPIRES_IN como inteiro puro, interpretado em segundos (AC-006)', () => {
    process.env.JWT_EXPIRES_IN = '60';

    const loadedEnv = loadEnvModule();

    expect(loadedEnv.jwtExpiresIn).toBe('60');
  });

  it('aceita JWT_EXPIRES_IN exatamente no teto de 1 hora (boundary)', () => {
    process.env.JWT_EXPIRES_IN = '1h';

    const loadedEnv = loadEnvModule();

    expect(loadedEnv.jwtExpiresIn).toBe('1h');
  });

  it('aceita JWT_EXPIRES_IN um pouco abaixo do teto de 1 hora', () => {
    process.env.JWT_EXPIRES_IN = '59m';

    const loadedEnv = loadEnvModule();

    expect(loadedEnv.jwtExpiresIn).toBe('59m');
  });

  it('aceita JWT_REFRESH_EXPIRES_IN exatamente no teto de 30 dias (boundary)', () => {
    process.env.JWT_REFRESH_EXPIRES_IN = '30d';

    const loadedEnv = loadEnvModule();

    expect(loadedEnv.jwtRefreshExpiresIn).toBe('30d');
  });

  it('aceita JWT_REFRESH_EXPIRES_IN um pouco abaixo do teto de 30 dias', () => {
    process.env.JWT_REFRESH_EXPIRES_IN = '29d';

    const loadedEnv = loadEnvModule();

    expect(loadedEnv.jwtRefreshExpiresIn).toBe('29d');
  });
});

describe('env — CORS_ORIGIN validation in production (FR-005, AC-008, AC-009, AC-011)', () => {
  const originalEnv = process.env;

  const VALID_PRODUCTION_ENV = {
    NODE_ENV: 'production',
    MONGO_URI: 'mongodb://prod-unit-test',
    CORS_ORIGIN: 'https://app.example.com',
    JWT_SECRET: 'a'.repeat(32),
    JWT_EXPIRES_IN: '15m',
    JWT_REFRESH_EXPIRES_IN: '7d',
    ADMIN_EMAIL: 'admin@example.com',
    ADMIN_PASSWORD: 'Str0ng!Passw0rd',
  };

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv, ...VALID_PRODUCTION_ENV };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('rejeita CORS_ORIGIN não definido em produção (AC-008)', () => {
    // Usa string vazia (em vez de `delete`) para representar "ausente" sem
    // depender de o `dotenv/config` (reexecutado a cada `isolateModules`)
    // preencher a variável a partir de um `.env` real.
    process.env.CORS_ORIGIN = '';

    const error = captureEnvLoadError();

    expect(error.message).toContain('CORS_ORIGIN');
  });

  it('rejeita CORS_ORIGIN vazio em produção (AC-008)', () => {
    process.env.CORS_ORIGIN = '';

    const error = captureEnvLoadError();

    expect(error.message).toContain('CORS_ORIGIN');
  });

  it('rejeita CORS_ORIGIN com curinga "*" em produção (AC-008, AC-011)', () => {
    process.env.CORS_ORIGIN = '*';

    const error = captureEnvLoadError();

    expect(error.message).toContain('CORS_ORIGIN');
    expect(error.message).not.toContain('*');
  });

  it('rejeita CORS_ORIGIN com entrada que não é uma URL válida em produção (AC-008, AC-011)', () => {
    const malformedOrigin = 'not-a-valid-url';
    process.env.CORS_ORIGIN = malformedOrigin;

    const error = captureEnvLoadError();

    expect(error.message).toContain('CORS_ORIGIN');
    expect(error.message).not.toContain(malformedOrigin);
  });

  it('rejeita CORS_ORIGIN com entrada http:// (não-HTTPS) em produção (AC-008, AC-011)', () => {
    const insecureOrigin = 'http://app.example.com';
    process.env.CORS_ORIGIN = insecureOrigin;

    const error = captureEnvLoadError();

    expect(error.message).toContain('CORS_ORIGIN');
    expect(error.message).not.toContain(insecureOrigin);
  });

  it.each([
    'https://app.example.com/',
    'https://app.example.com/path',
    'https://app.example.com?query=value',
    'https://app.example.com#fragment',
    'https://user:password@app.example.com',
  ])(
    'rejeita CORS_ORIGIN que não é uma origem serializada: %s',
    (invalidOrigin) => {
      process.env.CORS_ORIGIN = invalidOrigin;

      const error = captureEnvLoadError();

      expect(error.message).toContain('CORS_ORIGIN');
      expect(error.message).not.toContain(invalidOrigin);
    },
  );

  it('aceita CORS_ORIGIN com uma origem https:// válida em produção (AC-009)', () => {
    process.env.CORS_ORIGIN = 'https://app.example.com';

    const loadedEnv = loadEnvModule();

    expect(loadedEnv.corsOrigins).toEqual(['https://app.example.com']);
  });

  it('aceita CORS_ORIGIN com múltiplas origens https:// válidas em produção (AC-009)', () => {
    process.env.CORS_ORIGIN =
      'https://app.example.com,https://admin.example.com';

    const loadedEnv = loadEnvModule();

    expect(loadedEnv.corsOrigins).toEqual([
      'https://app.example.com',
      'https://admin.example.com',
    ]);
  });

  it('não bloqueia o startup com CORS_ORIGIN ausente fora de produção (AC-010)', () => {
    // Usa string vazia (em vez de `delete`) para representar "ausente" sem
    // depender de o `dotenv/config` (reexecutado a cada `isolateModules`)
    // preencher a variável a partir de um `.env` real, já que o dotenv só
    // define valores para chaves que ainda não existem em `process.env`.
    process.env = {
      ...originalEnv,
      NODE_ENV: 'development',
      MONGO_URI: 'mongodb://unit-test',
      JWT_SECRET: 'unit-test-secret',
      ADMIN_EMAIL: 'admin@example.com',
      ADMIN_PASSWORD: 'unit-test-password',
      CORS_ORIGIN: '',
    };

    const loadedEnv = loadEnvModule();

    expect(loadedEnv.corsOrigins).toEqual([]);
  });

  it('não bloqueia o startup com CORS_ORIGIN http:// fora de produção (AC-010)', () => {
    process.env = {
      ...originalEnv,
      NODE_ENV: 'test',
      MONGO_URI: 'mongodb://unit-test',
      JWT_SECRET: 'unit-test-secret',
      ADMIN_EMAIL: 'admin@example.com',
      ADMIN_PASSWORD: 'unit-test-password',
      CORS_ORIGIN: 'http://localhost:3000',
    };

    const loadedEnv = loadEnvModule();

    expect(loadedEnv.corsOrigins).toEqual(['http://localhost:3000']);
  });
});
