import type { NextFunction, Request, Response } from 'express';
import {
  COMMENT_HONEYPOT_FIELD,
  commentAntiBotMiddleware,
  isHoneypotTriggered,
} from '../../../../../src/infra/presentation/middleware/anti-bot.middleware';
import { HttpError } from '../../../../../src/core/domain/application/ApplicationError/http-error';

const legitimateBody = {
  authorName: 'Maria',
  content: 'Ótimo trabalho!',
};

function runMiddleware(
  body: unknown,
  headers: Record<string, string> = {},
): jest.Mock {
  const next = jest.fn();
  const request = { body, headers } as unknown as Request;

  commentAntiBotMiddleware(
    request,
    {} as Response,
    next as unknown as NextFunction,
  );

  return next;
}

function expectRejected(next: jest.Mock): void {
  expect(next).toHaveBeenCalledTimes(1);
  const [error] = next.mock.calls[0] as [unknown];
  expect(error).toBeInstanceOf(HttpError);
  const httpError = error as HttpError;
  expect(httpError.statusCode).toBe(400);
  expect(httpError.message).toBe('Payload inválido.');
  expect(httpError.details).toBeUndefined();
}

function expectAccepted(next: jest.Mock): void {
  expect(next).toHaveBeenCalledTimes(1);
  expect(next).toHaveBeenCalledWith();
}

describe('anti-bot.middleware (CARSHOP-140)', () => {
  it('expõe o nome do campo de controle', () => {
    expect(COMMENT_HONEYPOT_FIELD).toBe('website');
  });

  describe('isHoneypotTriggered', () => {
    it.each([
      ['undefined', undefined],
      ['null', null],
      ['array', [{ website: 'x' }]],
      ['string', 'website=x'],
      ['número', 42],
    ])('não dispara para body não-objeto (%s)', (_label, body) => {
      expect(isHoneypotTriggered(body, COMMENT_HONEYPOT_FIELD)).toBe(false);
    });

    it('não dispara quando o campo está ausente', () => {
      expect(isHoneypotTriggered(legitimateBody, COMMENT_HONEYPOT_FIELD)).toBe(
        false,
      );
    });

    it('não dispara quando o campo está vazio', () => {
      expect(
        isHoneypotTriggered(
          { ...legitimateBody, website: '' },
          COMMENT_HONEYPOT_FIELD,
        ),
      ).toBe(false);
    });

    it('não confunde variações de caixa do nome do campo (ficam para o schema estrito)', () => {
      expect(
        isHoneypotTriggered(
          { ...legitimateBody, Website: 'x', WEBSITE: 'x' },
          COMMENT_HONEYPOT_FIELD,
        ),
      ).toBe(false);
    });

    it('não dispara para chave "__proto__" vinda de JSON.parse (não é propriedade própria do campo)', () => {
      const body: unknown = JSON.parse(
        '{"authorName":"Maria","content":"Ótimo trabalho!","__proto__":{"website":"x"}}',
      );
      expect(isHoneypotTriggered(body, COMMENT_HONEYPOT_FIELD)).toBe(false);
    });

    it('respeita o nome de campo recebido por parâmetro', () => {
      expect(isHoneypotTriggered({ phone: 'x' }, 'phone')).toBe(true);
      expect(isHoneypotTriggered({ phone: '' }, 'phone')).toBe(false);
      expect(isHoneypotTriggered({ website: 'x' }, 'phone')).toBe(false);
    });

    it('ignora o campo herdado apenas via protótipo', () => {
      const body: unknown = Object.create({ website: 'x' });
      expect(isHoneypotTriggered(body, COMMENT_HONEYPOT_FIELD)).toBe(false);
    });

    it.each([
      ['string preenchida', 'http://spam.example.com'],
      ['só espaços', ' '],
      ['número', 0],
      ['null', null],
      ['boolean', true],
      ['objeto', {}],
      ['array', []],
      ['tab/quebra de linha', '\t\n'],
      ['caractere de largura zero', '\u200b'],
      ['string com aspas vazias', "''"],
      ['string "0"', '0'],
      ['boolean false', false],
      ['undefined como propriedade própria', undefined],
    ])('dispara para valor %s', (_label, fieldValue) => {
      expect(
        isHoneypotTriggered(
          { ...legitimateBody, website: fieldValue },
          COMMENT_HONEYPOT_FIELD,
        ),
      ).toBe(true);
    });
  });

  describe('commentAntiBotMiddleware', () => {
    it('aceita payload legítimo sem o campo (AC-001)', () => {
      expectAccepted(runMiddleware(legitimateBody));
    });

    it('aceita payload com o campo vazio (AC-001)', () => {
      expectAccepted(runMiddleware({ ...legitimateBody, website: '' }));
    });

    it('rejeita payload com o campo preenchido com 400 genérico, sem details (AC-002)', () => {
      expectRejected(
        runMiddleware({ ...legitimateBody, website: 'http://spam.example' }),
      );
    });

    it.each([0, null, true, {}, [], ' '])(
      'rejeita valor malformado %p de forma determinística (AC-006)',
      (fieldValue) => {
        expectRejected(
          runMiddleware({ ...legitimateBody, website: fieldValue }),
        );
      },
    );

    it.each([undefined, null, [], 'texto'])(
      'repassa body não-objeto %p para a validação existente',
      (body) => {
        expectAccepted(runMiddleware(body));
      },
    );

    it.each([
      ['navegador', { 'user-agent': 'Mozilla/5.0 (Windows NT 10.0)' }],
      ['curl', { 'user-agent': 'curl/8.0.0' }],
      ['sem User-Agent', {}],
    ])(
      'aceita payload legítimo independentemente do User-Agent: %s (AC-003)',
      (_label, headers) => {
        expectAccepted(runMiddleware(legitimateBody, headers));
      },
    );

    it('rejeita campo preenchido mesmo com User-Agent de navegador (AC-004)', () => {
      expectRejected(
        runMiddleware(
          { ...legitimateBody, website: 'x' },
          { 'user-agent': 'Mozilla/5.0 (Windows NT 10.0)' },
        ),
      );
    });

    it('é determinístico: a mesma entrada produz sempre a mesma decisão', () => {
      for (let attempt = 0; attempt < 3; attempt += 1) {
        expectRejected(runMiddleware({ ...legitimateBody, website: 'x' }));
        expectAccepted(runMiddleware({ ...legitimateBody, website: '' }));
      }
    });

    it('não altera o body da requisição', () => {
      const body = { ...legitimateBody, website: '' };
      runMiddleware(body);
      expect(body).toEqual({ ...legitimateBody, website: '' });
    });

    it('não revela o mecanismo nem o nome do campo na mensagem de erro', () => {
      const next = runMiddleware({ ...legitimateBody, website: 'x' });
      const [error] = next.mock.calls[0] as [HttpError];

      expect(error.message).not.toContain('website');
      expect(error.message.toLowerCase()).not.toContain('honeypot');
    });

    it('encaminha exceção inesperada para o next', () => {
      const failure = new Error('falha inesperada');
      const body = {};
      Object.defineProperty(body, 'website', {
        enumerable: true,
        get: () => {
          throw failure;
        },
      });

      const next = runMiddleware(body);

      expect(next).toHaveBeenCalledWith(failure);
    });
  });
});
