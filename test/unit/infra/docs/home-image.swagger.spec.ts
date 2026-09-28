import {
  homeImagePaths,
  homeImageSchemas,
  homeImageTags,
} from '../../../../src/infra/docs/home-image.swagger';

/**
 * CARSHOP-159 — FR-011/AC-015 (contract documentation) and NFR-003/AC-012
 * (no storage identifiers in the documented schema).
 */
describe('home-image.swagger (CARSHOP-159)', () => {
  it('declares the Home Image tag', () => {
    expect(homeImageTags).toEqual([
      expect.objectContaining({ name: 'Home Image' }),
    ]);
  });

  it('documents HomeImage with workId/imageId/url/alt only, never publicId', () => {
    expect(homeImageSchemas.HomeImage.required).toEqual([
      'workId',
      'imageId',
      'url',
      'alt',
    ]);
    expect(Object.keys(homeImageSchemas.HomeImage.properties).sort()).toEqual([
      'alt',
      'imageId',
      'url',
      'workId',
    ]);
    expect(JSON.stringify(homeImageSchemas)).not.toContain('publicId');
  });

  it('documents that dimensions are omitted (AC-001/AD-004)', () => {
    expect(homeImageSchemas.HomeImage.description).toContain('Dimensões');
    expect(homeImagePaths['/home-image'].get.description).toContain(
      'Dimensões',
    );
  });

  it('documents HomeImageResponse.image as nullable (AC-002)', () => {
    expect(homeImageSchemas.HomeImageResponse.required).toEqual(['image']);
    // OAS 3.0.3 only honours `nullable` when `type` is present.
    expect(homeImageSchemas.HomeImageResponse.properties.image).toMatchObject({
      type: 'object',
      nullable: true,
      allOf: [{ $ref: '#/components/schemas/HomeImage' }],
    });
  });

  it('documents SetHomeImageRequest as a closed { workId, imageId } reference with the identifier pattern (AC-007/AC-008)', () => {
    const request = homeImageSchemas.SetHomeImageRequest;

    expect(request.required).toEqual(['workId', 'imageId']);
    expect(request.additionalProperties).toBe(false);
    expect(Object.keys(request.properties).sort()).toEqual([
      'imageId',
      'workId',
    ]);
    for (const property of Object.values(request.properties)) {
      expect(property).toMatchObject({
        type: 'string',
        minLength: 1,
        maxLength: 64,
        pattern: '^[A-Za-z0-9-]+$',
      });
    }
  });

  it('documents GET /home-image as public with 200 (including the null case) and 429', () => {
    const operation = homeImagePaths['/home-image'].get;

    expect(operation.security).toEqual([]);
    expect(Object.keys(operation.responses).sort()).toEqual(['200', '429']);
    expect(operation.description).toContain('{ "image": null }');
    expect(operation.description).toContain(
      'Responde 200 tanto com imagem configurada quanto com `image: null`',
    );
    expect(operation.description).not.toContain('Sempre responde 200');
    expect(
      operation.responses['200'].content['application/json'].schema,
    ).toEqual({ $ref: '#/components/schemas/HomeImageResponse' });
  });

  it('documents PATCH /admin/home-image with bearer auth, required body and 200/400/401/404/409/429/500 (AC-015)', () => {
    const operation = homeImagePaths['/admin/home-image'].patch;

    expect(operation.security).toEqual([{ bearerAuth: [] }]);
    expect(operation.requestBody.required).toBe(true);
    expect(operation.requestBody.content['application/json'].schema).toEqual({
      $ref: '#/components/schemas/SetHomeImageRequest',
    });
    expect(Object.keys(operation.responses).sort()).toEqual([
      '200',
      '400',
      '401',
      '404',
      '409',
      '429',
      '500',
    ]);
    expect(operation.responses['404'].description).toContain(
      'imagem não encontrada',
    );
  });

  it('documents both 400 messages of PATCH /admin/home-image: malformed JSON and invalid payload', () => {
    const badRequest =
      homeImagePaths['/admin/home-image'].patch.responses['400'];

    expect(badRequest.description).toContain(
      '{ "message": "JSON inválido no corpo da requisição." }',
    );
    expect(badRequest.description).toContain(
      '{ "message": "Payload inválido." }',
    );
    expect(badRequest.content['application/json'].schema).toEqual({
      $ref: '#/components/schemas/ErrorResponse',
    });
  });

  it('describes the eligibility rule and the read-time unlinking on removal (AD-002/AD-003)', () => {
    for (const description of [
      homeImagePaths['/home-image'].get.description,
      homeImagePaths['/admin/home-image'].patch.description,
    ]) {
      expect(description).toContain('published');
      expect(description).toContain(
        'DELETE /admin/works/{workId}/images/{imageId}',
      );
      expect(description).toContain('DELETE /admin/works/{workId}');
      expect(description).toContain('draft');
    }
  });
});
