import { expect, describe, it } from '@jest/globals';
import {
  HOME_IMAGE_SETTING_KEY,
  HomeImageSettingModel,
} from '../../../../src/data/models/home-image-setting.model';

/**
 * CARSHOP-159 — FR-001: the persisted Home image configuration is a
 * singleton guaranteed by a single-value `key` enum plus a unique index.
 */
describe('HomeImageSettingModel (CARSHOP-159 FR-001)', () => {
  it('validates a document with workId and imageId, defaulting key to "home"', async () => {
    const document = new HomeImageSettingModel({
      workId: 'work-1',
      imageId: 'image-1',
    });

    await expect(document.validate()).resolves.toBeUndefined();
    expect(document.key).toBe(HOME_IMAGE_SETTING_KEY);
    expect(HOME_IMAGE_SETTING_KEY).toBe('home');
  });

  it('trims workId and imageId', () => {
    const document = new HomeImageSettingModel({
      workId: '  work-1  ',
      imageId: '  image-1  ',
    });

    expect(document.workId).toBe('work-1');
    expect(document.imageId).toBe('image-1');
  });

  it('requires workId', async () => {
    const document = new HomeImageSettingModel({ imageId: 'image-1' });

    await expect(document.validate()).rejects.toThrow(/workId/);
  });

  it('requires imageId', async () => {
    const document = new HomeImageSettingModel({ workId: 'work-1' });

    await expect(document.validate()).rejects.toThrow(/imageId/);
  });

  it('rejects any key other than "home", so a second configuration cannot exist', async () => {
    const document = new HomeImageSettingModel({
      key: 'secondary',
      workId: 'work-1',
      imageId: 'image-1',
    });

    await expect(document.validate()).rejects.toThrow(/key/);
  });

  it('declares a unique index on key', () => {
    const indexes = HomeImageSettingModel.schema.indexes();

    expect(indexes).toEqual(
      expect.arrayContaining([
        [{ key: 1 }, expect.objectContaining({ unique: true })],
      ]),
    );
  });

  it('uses the home_image_settings collection with timestamps and no version key', () => {
    expect(HomeImageSettingModel.collection.collectionName).toBe(
      'home_image_settings',
    );
    expect(HomeImageSettingModel.schema.path('createdAt')).toBeDefined();
    expect(HomeImageSettingModel.schema.path('updatedAt')).toBeDefined();
    expect(HomeImageSettingModel.schema.path('__v')).toBeUndefined();
  });
});
