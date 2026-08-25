type UploadCallback = (
  error: { message: string } | undefined,
  result: { secure_url?: string; public_id?: string } | undefined,
) => void;

const mockConfig = jest.fn();
const mockEnd = jest.fn();
const mockUploadStream = jest.fn();
const mockDestroy = jest.fn();

jest.mock('cloudinary', () => ({
  v2: {
    config: (...args: unknown[]) =>
      (mockConfig as unknown as (...a: unknown[]) => unknown)(...args),
    uploader: {
      upload_stream: (
        options: unknown,
        callback: UploadCallback,
      ): { end: (buffer: Buffer) => void } =>
        (
          mockUploadStream as unknown as (
            options: unknown,
            callback: UploadCallback,
          ) => { end: (buffer: Buffer) => void }
        )(options, callback),
      destroy: (...args: unknown[]) =>
        (mockDestroy as unknown as (...a: unknown[]) => unknown)(...args),
    },
  },
}));

import { CloudinaryStorageService } from '../../../../../src/infra/gateway/cloudinary/cloudinary-storage.service';

describe('CloudinaryStorageService', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = {
      ...originalEnv,
      CLOUDINARY_CLOUD_NAME: 'unit-test-cloud',
      CLOUDINARY_API_KEY: 'unit-test-key',
      CLOUDINARY_API_SECRET: 'unit-test-secret',
    };
    mockUploadStream.mockImplementation(() => ({ end: mockEnd }));
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('lança erro quando as variáveis do Cloudinary não estão configuradas', () => {
    delete process.env.CLOUDINARY_CLOUD_NAME;

    expect(() => new CloudinaryStorageService()).toThrow(
      'As variáveis do Cloudinary não foram configuradas corretamente.',
    );
  });

  it('configura o SDK do Cloudinary com as credenciais do ambiente', () => {
    new CloudinaryStorageService();

    expect(mockConfig).toHaveBeenCalledWith({
      cloud_name: 'unit-test-cloud',
      api_key: 'unit-test-key',
      api_secret: 'unit-test-secret',
      secure: true,
    });
  });

  describe('upload', () => {
    it('resolve com url e publicId quando o upload é bem-sucedido', async () => {
      mockUploadStream.mockImplementation((_options, callback) => {
        callback(undefined, {
          secure_url: 'https://cdn.example.com/image.png',
          public_id: 'carshop/works/work-1/image-1',
        });
        return { end: mockEnd };
      });

      const service = new CloudinaryStorageService();

      const result = await service.upload({
        buffer: Buffer.from('image-data'),
        mimeType: 'image/png',
        originalName: 'image.png',
        folder: 'carshop/works/work-1',
      });

      expect(result).toEqual({
        url: 'https://cdn.example.com/image.png',
        publicId: 'carshop/works/work-1/image-1',
      });
      expect(mockEnd).toHaveBeenCalledWith(Buffer.from('image-data'));
    });

    it('rejeita quando o Cloudinary retorna erro', async () => {
      mockUploadStream.mockImplementation((_options, callback) => {
        callback({ message: 'falha de rede' }, undefined);
        return { end: mockEnd };
      });

      const service = new CloudinaryStorageService();

      await expect(
        service.upload({
          buffer: Buffer.from('image-data'),
          mimeType: 'image/png',
          originalName: 'image.png',
          folder: 'carshop/works/work-1',
        }),
      ).rejects.toThrow('Falha no upload da imagem: falha de rede');
    });

    it('rejeita quando o Cloudinary não retorna secure_url ou public_id', async () => {
      mockUploadStream.mockImplementation((_options, callback) => {
        callback(undefined, {});
        return { end: mockEnd };
      });

      const service = new CloudinaryStorageService();

      await expect(
        service.upload({
          buffer: Buffer.from('image-data'),
          mimeType: 'image/png',
          originalName: 'image.png',
          folder: 'carshop/works/work-1',
        }),
      ).rejects.toThrow('O Cloudinary não retornou os dados da imagem.');
    });
  });

  describe('delete', () => {
    it('resolve quando o Cloudinary confirma a exclusão', async () => {
      mockDestroy.mockResolvedValue({ result: 'ok' });

      const service = new CloudinaryStorageService();

      await expect(
        service.delete('carshop/works/work-1/image-1'),
      ).resolves.toBeUndefined();
      expect(mockDestroy).toHaveBeenCalledWith(
        'carshop/works/work-1/image-1',
        { resource_type: 'image', invalidate: true },
      );
    });

    it('trata "not found" como sucesso (idempotência)', async () => {
      mockDestroy.mockResolvedValue({ result: 'not found' });

      const service = new CloudinaryStorageService();

      await expect(
        service.delete('carshop/works/work-1/image-1'),
      ).resolves.toBeUndefined();
    });

    it('lança erro quando o Cloudinary não confirma a exclusão', async () => {
      mockDestroy.mockResolvedValue({ result: 'error' });

      const service = new CloudinaryStorageService();

      await expect(
        service.delete('carshop/works/work-1/image-1'),
      ).rejects.toThrow(
        'Não foi possível excluir a imagem "carshop/works/work-1/image-1" do Cloudinary.',
      );
    });
  });
});
