import {
  commentsPaths,
  commentsSchemas,
} from '../../../../src/infra/docs/comments.swagger';
import { COMMENT_HONEYPOT_FIELD } from '../../../../src/infra/presentation/middleware/anti-bot.middleware';

/**
 * CARSHOP-140 — FR-009/AC-009: contrato documentado do campo de controle
 * anti-automação em POST /works/{workId}/comments.
 */
describe('comments.swagger (CARSHOP-140)', () => {
  it('documenta o campo de controle opcional e vazio em CommentRequest', () => {
    const request = commentsSchemas.CommentRequest;

    expect(request.properties).toHaveProperty(COMMENT_HONEYPOT_FIELD);
    expect(request.properties.website).toMatchObject({
      type: 'string',
      maxLength: 0,
    });
    expect(request.required).toEqual(['authorName', 'content']);
    expect(request.required).not.toContain(COMMENT_HONEYPOT_FIELD);
  });

  it('não menciona o termo honeypot na documentação pública', () => {
    expect(JSON.stringify(commentsSchemas).toLowerCase()).not.toContain(
      'honeypot',
    );
    expect(JSON.stringify(commentsPaths).toLowerCase()).not.toContain(
      'honeypot',
    );
  });

  it('documenta 400 (incluindo rejeição anti-automação sem details) e mantém 429', () => {
    const responses = commentsPaths['/works/{workId}/comments'].post.responses;

    expect(Object.keys(responses).sort()).toEqual(['201', '400', '404', '429']);
    expect(responses['400'].description).toContain('anti-automação');
    expect(responses['400'].description).toContain('details');
    expect(responses['429'].description).toContain(
      'limite dedicado de comentários',
    );
  });
});
