import { containsHtmlOrScriptMarkup } from '../../../../../src/infra/presentation/validators/html-content.guard';

describe('containsHtmlOrScriptMarkup', () => {
  it('detecta um elemento <script> (AC-001)', () => {
    expect(containsHtmlOrScriptMarkup('<script>alert(1)</script>')).toBe(true);
  });

  it('detecta um atributo de evento em <img> (AC-002)', () => {
    expect(containsHtmlOrScriptMarkup('<img src=x onerror=alert(1)>')).toBe(
      true,
    );
  });

  it('detecta um atributo de evento inline em <div> (AC-003)', () => {
    expect(containsHtmlOrScriptMarkup('<div onclick="alert(1)">hi</div>')).toBe(
      true,
    );
  });

  it('detecta uma URI javascript: (AC-004)', () => {
    expect(
      containsHtmlOrScriptMarkup('<a href="javascript:alert(1)">click</a>'),
    ).toBe(true);
  });

  it('detecta entidades HTML que codificam < e >', () => {
    expect(containsHtmlOrScriptMarkup('&lt;script&gt;')).toBe(true);
  });

  it('aceita texto plano sem marcação (AC-005)', () => {
    expect(containsHtmlOrScriptMarkup('Ótimo trabalho, ficou excelente!')).toBe(
      false,
    );
    expect(containsHtmlOrScriptMarkup('Maria Silva')).toBe(false);
  });

  it('não rejeita um "<" solto em prosa comum (caso-limite)', () => {
    expect(containsHtmlOrScriptMarkup('5 < 10 segundos')).toBe(false);
  });

  it('detecta uma tag com "/" como separador entre nome e atributo, sem espaço (bypass)', () => {
    expect(containsHtmlOrScriptMarkup('<img/src=x>')).toBe(true);
  });

  it('detecta uma tag com "/" como separador contendo uma URI data: com HTML/script embutido (bypass)', () => {
    expect(
      containsHtmlOrScriptMarkup('<object/data=data:text/html;base64,QUJD>'),
    ).toBe(true);
  });

  it('detecta um atributo de evento com "/" como separador também via HTML_TAG_PATTERN', () => {
    expect(containsHtmlOrScriptMarkup('<svg/onload=alert(1)>')).toBe(true);
  });

  it('continua detectando tags autofecháveis sem atributos (<br/> e <br />)', () => {
    expect(containsHtmlOrScriptMarkup('<br/>')).toBe(true);
    expect(containsHtmlOrScriptMarkup('<br />')).toBe(true);
  });

  it('reconfirma que texto plano permanece aceito após o padrão ampliado', () => {
    expect(containsHtmlOrScriptMarkup('5 < 10 segundos')).toBe(false);
    expect(containsHtmlOrScriptMarkup('Ótimo trabalho, ficou excelente!')).toBe(
      false,
    );
  });
});
