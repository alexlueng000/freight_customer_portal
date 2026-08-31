import { ServiceUnavailableException } from '@nestjs/common';
import { DocumentStorageService } from './document-storage.service.js';

describe('DocumentStorageService', () => {
  const originalEnvironment = { ...process.env };

  beforeEach(() => {
    process.env.S3_ENDPOINT = 'http://127.0.0.1:9000';
    process.env.S3_ACCESS_KEY_ID = 'test-access-key';
    process.env.S3_SECRET_ACCESS_KEY = 'test-secret-key';
  });

  afterEach(() => {
    process.env = { ...originalEnvironment };
  });

  it('returns a clear dependency error when storage configuration is missing', async () => {
    delete process.env.S3_ENDPOINT;
    const service = new DocumentStorageService();

    await expect(service.checkReady()).rejects.toMatchObject({
      response: {
        code: 'DOCUMENT_STORAGE_NOT_CONFIGURED',
        message: '文件存储服务尚未配置，请联系系统管理员。',
      },
    });
    service.onModuleDestroy();
  });

  it('maps bucket initialization failures to a service unavailable error', async () => {
    const service = new DocumentStorageService();
    const send = jest.fn().mockRejectedValue(new Error('connection refused'));
    (service as unknown as { s3: { send: typeof send } }).s3.send = send;

    await expect(service.checkReady()).rejects.toBeInstanceOf(ServiceUnavailableException);
    await expect(service.checkReady()).rejects.toMatchObject({
      response: { code: 'DOCUMENT_STORAGE_UNAVAILABLE' },
    });
    expect(send).toHaveBeenCalledTimes(2);
    service.onModuleDestroy();
  });
});
