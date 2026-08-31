import {
  CreateBucketCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { Injectable, ServiceUnavailableException, type OnModuleDestroy } from '@nestjs/common';

@Injectable()
export class DocumentStorageService implements OnModuleDestroy {
  private readonly bucket = process.env.S3_BUCKET ?? 'freight-documents';
  private readonly s3 = new S3Client({
    endpoint: process.env.S3_ENDPOINT,
    region: process.env.S3_REGION ?? 'us-east-1',
    forcePathStyle: process.env.S3_FORCE_PATH_STYLE !== 'false',
    credentials:
      process.env.S3_ACCESS_KEY_ID && process.env.S3_SECRET_ACCESS_KEY
        ? {
            accessKeyId: process.env.S3_ACCESS_KEY_ID,
            secretAccessKey: process.env.S3_SECRET_ACCESS_KEY,
          }
        : undefined,
  });
  private bucketReady?: Promise<void>;

  async upload(objectKey: string, file: Express.Multer.File) {
    try {
      await this.ensureBucket();
      await this.s3.send(
        new PutObjectCommand({
          Bucket: this.bucket,
          Key: objectKey,
          Body: file.buffer,
          ContentType: file.mimetype,
        }),
      );
    } catch (error) {
      throw this.unavailable(error);
    }
  }

  async checkReady() {
    try {
      await this.ensureBucket();
    } catch (error) {
      throw this.unavailable(error);
    }
  }

  async download(objectKey: string) {
    const response = await this.s3.send(
      new GetObjectCommand({ Bucket: this.bucket, Key: objectKey }),
    );
    if (!response.Body)
      throw new ServiceUnavailableException({
        code: 'DOCUMENT_NOT_AVAILABLE',
        message: 'Document content is not available',
      });
    return Buffer.from(await response.Body.transformToByteArray());
  }

  async remove(objectKey: string) {
    await this.s3
      .send(new DeleteObjectCommand({ Bucket: this.bucket, Key: objectKey }))
      .catch(() => undefined);
  }

  private ensureBucket() {
    // Validate before the SDK falls back to an unintended default AWS endpoint.
    this.assertConfigured();
    this.bucketReady ??= this.prepareBucket().catch((error: unknown) => {
      // A rejected cached promise would keep storage unavailable after MinIO recovers.
      this.bucketReady = undefined;
      throw error;
    });
    return this.bucketReady;
  }

  private async prepareBucket() {
    try {
      await this.s3.send(new HeadBucketCommand({ Bucket: this.bucket }));
    } catch (error) {
      const status = (error as { $metadata?: { httpStatusCode?: number } }).$metadata
        ?.httpStatusCode;
      if (status !== 404) throw error;
      await this.s3.send(new CreateBucketCommand({ Bucket: this.bucket }));
    }
  }

  private assertConfigured() {
    const missing = [
      ['S3_ENDPOINT', process.env.S3_ENDPOINT],
      ['S3_ACCESS_KEY_ID', process.env.S3_ACCESS_KEY_ID],
      ['S3_SECRET_ACCESS_KEY', process.env.S3_SECRET_ACCESS_KEY],
    ]
      .filter(([, value]) => !value)
      .map(([key]) => key);
    if (missing.length) {
      throw new ServiceUnavailableException({
        code: 'DOCUMENT_STORAGE_NOT_CONFIGURED',
        message: '文件存储服务尚未配置，请联系系统管理员。',
        details: { missing },
      });
    }
  }

  private unavailable(error: unknown) {
    if (error instanceof ServiceUnavailableException) return error;
    return new ServiceUnavailableException({
      code: 'DOCUMENT_STORAGE_UNAVAILABLE',
      message: '文件存储服务暂时不可用，请稍后重试或联系系统管理员。',
      details: { dependency: 's3' },
    });
  }

  onModuleDestroy() {
    this.s3.destroy();
  }
}
