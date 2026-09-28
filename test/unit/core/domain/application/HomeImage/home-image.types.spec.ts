import { isWorkEligibleForHomeImage } from '../../../../../../src/core/domain/application/HomeImage/home-image.types';
import type { Work } from '../../../../../../src/core/domain/application/Work/work.types';

function buildWork(overrides: Partial<Work> = {}): Work {
  return {
    id: 'work-1',
    slug: 'work-slug',
    title: 'Work title',
    description: 'Work description',
    category: 'bancos',
    tags: [],
    images: [],
    status: 'published',
    deletedAt: null,
    createdAt: '2024-01-01T00:00:00.000Z',
    updatedAt: '2024-01-01T00:00:00.000Z',
    ...overrides,
  };
}

/**
 * CARSHOP-159 — AD-003 / FR-009: eligibility rule shared by selection and
 * public read (AC-006, AC-011).
 */
describe('isWorkEligibleForHomeImage (CARSHOP-159 FR-009)', () => {
  it('considers a published, active work eligible', () => {
    expect(isWorkEligibleForHomeImage(buildWork())).toBe(true);
  });

  it('considers a published work without the deletedAt field eligible', () => {
    const work = buildWork();
    delete work.deletedAt;

    expect(isWorkEligibleForHomeImage(work)).toBe(true);
  });

  it('rejects a draft work (AC-006, AC-011)', () => {
    expect(isWorkEligibleForHomeImage(buildWork({ status: 'draft' }))).toBe(
      false,
    );
  });

  it('rejects a logically removed work even when published (AC-011)', () => {
    expect(
      isWorkEligibleForHomeImage(
        buildWork({ deletedAt: '2024-02-01T00:00:00.000Z' }),
      ),
    ).toBe(false);
  });
});
