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
    await this.ensureBucket();
    try {
      await this.s3.send(
        new PutObjectCommand({
          Bucket: this.bucket,
          Key: objectKey,
          Body: file.buffer,
          ContentType: file.mimetype,
        }),
      );
    } catch {
      throw new ServiceUnavailableException({
        code: 'DOCUMENT_STORAGE_UNAVAILABLE',
        message: 'Document storage is unavailable',
      });
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
    this.bucketReady ??= this.s3
      .send(new HeadBucketCommand({ Bucket: this.bucket }))
      .then(() => undefined)
      .catch(async (error: { $metadata?: { httpStatusCode?: number } }) => {
        if (error.$metadata?.httpStatusCode !== 404) throw error;
        await this.s3.send(new CreateBucketCommand({ Bucket: this.bucket }));
      });
    return this.bucketReady;
  }

  onModuleDestroy() {
    this.s3.destroy();
  }
}
