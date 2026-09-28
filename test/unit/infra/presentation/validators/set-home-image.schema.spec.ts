import { setHomeImageSchema } from '../../../../../src/infra/presentation/validators/set-home-image.schema';

const VALID_WORK_ID = 'cf357670-d168-48b4-a5de-c57dff7858fe';
const VALID_IMAGE_ID = '0b7e4a1c-3f2d-4c5e-9a8b-1d2e3f4a5b6c';

/**
 * CARSHOP-159 — FR-005/FR-006/FR-007, AC-007/AC-008: the selection body
 * accepts only a `{ workId, imageId }` reference to a system-managed image.
 */
describe('setHomeImageSchema (CARSHOP-159)', () => {
  it('accepts a UUID workId/imageId pair and trims surrounding whitespace', () => {
    const result = setHomeImageSchema.safeParse({
      workId: `  ${VALID_WORK_ID} `,
      imageId: VALID_IMAGE_ID,
    });

    expect(result.success).toBe(true);
    expect(result.data).toEqual({
      workId: VALID_WORK_ID,
      imageId: VALID_IMAGE_ID,
    });
  });

  it('accepts identifiers at the 64-character limit', () => {
    expect(
      setHomeImageSchema.safeParse({
        workId: 'a'.repeat(64),
        imageId: 'b'.repeat(64),
      }).success,
    ).toBe(true);
  });

  it.each([
    ['empty object', {}],
    ['missing imageId', { workId: VALID_WORK_ID }],
    ['missing workId', { imageId: VALID_IMAGE_ID }],
    ['numeric workId', { workId: 123, imageId: VALID_IMAGE_ID }],
    ['object imageId', { workId: VALID_WORK_ID, imageId: { $ne: null } }],
    ['blank workId', { workId: '   ', imageId: VALID_IMAGE_ID }],
    [
      'workId over 64 chars',
      { workId: 'a'.repeat(65), imageId: VALID_IMAGE_ID },
    ],
    ['null body', null],
    ['array body', [VALID_WORK_ID, VALID_IMAGE_ID]],
    ['string body', 'workId'],
  ])('rejects a missing or malformed body: %s (AC-007)', (_label, payload) => {
    expect(setHomeImageSchema.safeParse(payload).success).toBe(false);
  });

  it('rejects an arbitrary url field alongside a valid reference (AC-008)', () => {
    expect(
      setHomeImageSchema.safeParse({
        workId: VALID_WORK_ID,
        imageId: VALID_IMAGE_ID,
        url: 'https://attacker.example.com/image.jpg',
      }).success,
    ).toBe(false);
  });

  it('rejects a body containing only a url (AC-008)', () => {
    expect(
      setHomeImageSchema.safeParse({
        url: 'https://attacker.example.com/image.jpg',
      }).success,
    ).toBe(false);
  });

  it.each([
    'https://attacker.example.com/image.jpg',
    'image.jpg',
    'a/b',
    'javascript:alert(1)',
    '$ne',
  ])('rejects %s as imageId (AC-008)', (maliciousImageId) => {
    expect(
      setHomeImageSchema.safeParse({
        workId: VALID_WORK_ID,
        imageId: maliciousImageId,
      }).success,
    ).toBe(false);
  });

  it.each(['__proto__', 'constructor', '$where', 'workId.nested'])(
    'rejects the non-allowlisted key %s before the object is rebuilt',
    (dangerousKey) => {
      const payload = JSON.parse(
        `{"${dangerousKey}":{"polluted":true},"workId":"${VALID_WORK_ID}","imageId":"${VALID_IMAGE_ID}"}`,
      ) as Record<string, unknown>;

      expect(setHomeImageSchema.safeParse(payload).success).toBe(false);
    },
  );
});
