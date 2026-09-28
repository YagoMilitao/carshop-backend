import { MongoHomeImageSettingsRepository } from '../../../../src/infra/repositories/mongo-home-image-settings.repository';
import { HttpError } from '../../../../src/core/domain/application/ApplicationError/http-error';

jest.mock('../../../../src/data/models/home-image-setting.model', () => ({
  HOME_IMAGE_SETTING_KEY: 'home',
  HomeImageSettingModel: {
    findOne: jest.fn(),
    findOneAndUpdate: jest.fn(),
  },
}));

interface MockedHomeImageSettingModel {
  HomeImageSettingModel: {
    findOne: jest.Mock;
    findOneAndUpdate: jest.Mock;
  };
}

const homeImageSettingModel = jest.requireMock<MockedHomeImageSettingModel>(
  '../../../../src/data/models/home-image-setting.model',
);

const persistedDocument = {
  _id: 'mongo-object-id',
  key: 'home',
  workId: 'work-1',
  imageId: 'image-1',
  createdAt: new Date('2024-01-01T00:00:00.000Z'),
  updatedAt: new Date('2024-01-02T00:00:00.000Z'),
};

function mockUpsertResolving(document: unknown) {
  homeImageSettingModel.HomeImageSettingModel.findOneAndUpdate.mockReturnValueOnce(
    { lean: () => Promise.resolve(document) },
  );
}

function mockUpsertRejecting(error: unknown) {
  homeImageSettingModel.HomeImageSettingModel.findOneAndUpdate.mockReturnValueOnce(
    { lean: jest.fn().mockRejectedValue(error) },
  );
}

/**
 * CARSHOP-159 — FR-001/FR-002, AC-004, AC-014: singleton persistence of the
 * Home image reference, mapped without internal fields (NFR-003/AC-012).
 */
describe('MongoHomeImageSettingsRepository (CARSHOP-159)', () => {
  const repository = new MongoHomeImageSettingsRepository();

  beforeEach(() => {
    jest.clearAllMocks();
    homeImageSettingModel.HomeImageSettingModel.findOneAndUpdate.mockReset();
  });

  describe('find', () => {
    it('returns undefined when no configuration exists', async () => {
      homeImageSettingModel.HomeImageSettingModel.findOne.mockReturnValue({
        lean: () => Promise.resolve(null),
      });

      await expect(repository.find()).resolves.toBeUndefined();
      expect(
        homeImageSettingModel.HomeImageSettingModel.findOne,
      ).toHaveBeenCalledWith({ key: 'home' });
    });

    it('maps the persisted singleton without _id or key (AC-014)', async () => {
      homeImageSettingModel.HomeImageSettingModel.findOne.mockReturnValue({
        lean: () => Promise.resolve(persistedDocument),
      });

      await expect(repository.find()).resolves.toEqual({
        workId: 'work-1',
        imageId: 'image-1',
        updatedAt: '2024-01-02T00:00:00.000Z',
      });
    });
  });

  describe('save', () => {
    it('upserts the single "home" document with validators and maps the result (AC-004)', async () => {
      mockUpsertResolving(persistedDocument);

      const selection = await repository.save({
        workId: 'work-1',
        imageId: 'image-1',
      });

      expect(
        homeImageSettingModel.HomeImageSettingModel.findOneAndUpdate,
      ).toHaveBeenCalledTimes(1);
      expect(
        homeImageSettingModel.HomeImageSettingModel.findOneAndUpdate,
      ).toHaveBeenCalledWith(
        { key: 'home' },
        { $set: { workId: 'work-1', imageId: 'image-1' } },
        { upsert: true, new: true, runValidators: true },
      );
      expect(selection).toEqual({
        workId: 'work-1',
        imageId: 'image-1',
        updatedAt: '2024-01-02T00:00:00.000Z',
      });
      expect(selection).not.toHaveProperty('_id');
      expect(selection).not.toHaveProperty('key');
    });

    it('retries once when the first upsert races on the unique index (code 11000)', async () => {
      mockUpsertRejecting(
        Object.assign(new Error('E11000 duplicate key'), { code: 11000 }),
      );
      mockUpsertResolving(persistedDocument);

      await expect(
        repository.save({ workId: 'work-1', imageId: 'image-1' }),
      ).resolves.toEqual({
        workId: 'work-1',
        imageId: 'image-1',
        updatedAt: '2024-01-02T00:00:00.000Z',
      });
      expect(
        homeImageSettingModel.HomeImageSettingModel.findOneAndUpdate,
      ).toHaveBeenCalledTimes(2);
    });

    it('retries only once: a second duplicate-key error propagates', async () => {
      const duplicateKeyError = Object.assign(new Error('E11000'), {
        code: 11000,
      });
      mockUpsertRejecting(duplicateKeyError);
      mockUpsertRejecting(duplicateKeyError);

      await expect(
        repository.save({ workId: 'work-1', imageId: 'image-1' }),
      ).rejects.toBe(duplicateKeyError);
      expect(
        homeImageSettingModel.HomeImageSettingModel.findOneAndUpdate,
      ).toHaveBeenCalledTimes(2);
    });

    it.each([
      ['a generic error', new Error('connection lost')],
      ['a non-duplicate coded error', { code: 121 }],
      ['a non-object rejection', 'boom'],
    ])('propagates %s without retrying', async (_label, error) => {
      mockUpsertRejecting(error);

      await expect(
        repository.save({ workId: 'work-1', imageId: 'image-1' }),
      ).rejects.toBe(error);
      expect(
        homeImageSettingModel.HomeImageSettingModel.findOneAndUpdate,
      ).toHaveBeenCalledTimes(1);
    });

    it('fails with a generic 500 when the upsert unexpectedly returns no document', async () => {
      mockUpsertResolving(null);

      const result = repository.save({ workId: 'work-1', imageId: 'image-1' });

      await expect(result).rejects.toBeInstanceOf(HttpError);
      await expect(result).rejects.toMatchObject({
        statusCode: 500,
        message: 'Falha ao salvar a configuração da Home.',
      });
    });

    it.each([
      ['workId', { workId: '$ne', imageId: 'image-1' }],
      ['workId', { workId: 'a.b', imageId: 'image-1' }],
      ['workId', { workId: '   ', imageId: 'image-1' }],
      ['imageId', { workId: 'work-1', imageId: '$gt' }],
      ['imageId', { workId: 'work-1', imageId: 'x.y' }],
      ['imageId', { workId: 'work-1', imageId: '' }],
    ])(
      'rejects an unsafe %s with 400 before reaching Mongo (%p)',
      async (fieldName, input) => {
        const result = repository.save(input);

        await expect(result).rejects.toMatchObject({
          statusCode: 400,
          message: `${fieldName} deve ser uma string válida.`,
        });
        expect(
          homeImageSettingModel.HomeImageSettingModel.findOneAndUpdate,
        ).not.toHaveBeenCalled();
      },
    );

    it('rejects a non-string identifier (operator object) with 400', async () => {
      const input = {
        workId: { $ne: null },
        imageId: 'image-1',
      } as unknown as { workId: string; imageId: string };

      await expect(repository.save(input)).rejects.toMatchObject({
        statusCode: 400,
      });
      expect(
        homeImageSettingModel.HomeImageSettingModel.findOneAndUpdate,
      ).not.toHaveBeenCalled();
    });
  });
});
