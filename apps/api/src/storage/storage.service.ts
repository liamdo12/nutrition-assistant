import { BadRequestException, Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Storage } from '@google-cloud/storage';
import { randomUUID } from 'crypto';
import {
  SIGNED_URL_UPLOAD_EXPIRY_MS,
  SIGNED_URL_DOWNLOAD_EXPIRY_MS,
  ALLOWED_CONTENT_TYPES,
} from './storage.constants';

@Injectable()
export class StorageService {
  private readonly logger = new Logger(StorageService.name);
  private storage: Storage | null = null;
  private bucketName: string | null = null;

  constructor(private configService: ConfigService) {
    const projectId = this.configService.get<string>('GCP_PROJECT_ID');
    this.bucketName = this.configService.get<string>('GCS_BUCKET_NAME') ?? null;

    if (this.bucketName) {
      this.storage = new Storage({ projectId });
      this.logger.log(`Storage initialized: bucket=${this.bucketName}`);
    } else {
      this.logger.warn('GCS_BUCKET_NAME not set — storage disabled');
    }
  }

  isEnabled(): boolean {
    return this.storage !== null && this.bucketName !== null;
  }

  async generateUploadUrl(
    userId: string,
    contentType: string,
  ): Promise<{ signedUrl: string; objectPath: string }> {
    this.assertEnabled();
    this.assertContentType(contentType);

    const fileId = randomUUID();
    const extension = contentType === 'image/png' ? 'png' : contentType === 'image/webp' ? 'webp' : 'jpg';
    const objectPath = `users/${userId}/${fileId}.${extension}`;

    const file = this.storage!.bucket(this.bucketName!).file(objectPath);

    const [signedUrl] = await file.getSignedUrl({
      version: 'v4',
      action: 'write',
      expires: Date.now() + SIGNED_URL_UPLOAD_EXPIRY_MS,
      contentType,
    });

    return { signedUrl, objectPath };
  }

  async generateDownloadUrl(objectPath: string): Promise<string> {
    this.assertEnabled();

    const file = this.storage!.bucket(this.bucketName!).file(objectPath);

    const [signedUrl] = await file.getSignedUrl({
      version: 'v4',
      action: 'read',
      expires: Date.now() + SIGNED_URL_DOWNLOAD_EXPIRY_MS,
    });

    return signedUrl;
  }

  async fileExists(objectPath: string): Promise<boolean> {
    this.assertEnabled();
    const file = this.storage!.bucket(this.bucketName!).file(objectPath);
    const [exists] = await file.exists();
    return exists;
  }

  async deleteFile(objectPath: string): Promise<void> {
    this.assertEnabled();
    await this.storage!.bucket(this.bucketName!).file(objectPath).delete();
  }

  private assertEnabled(): void {
    if (!this.isEnabled()) {
      throw new ServiceUnavailableException('Storage service not configured');
    }
  }

  private assertContentType(contentType: string): void {
    if (!ALLOWED_CONTENT_TYPES.includes(contentType as (typeof ALLOWED_CONTENT_TYPES)[number])) {
      throw new BadRequestException(
        `Unsupported content type: ${contentType}. Allowed: ${ALLOWED_CONTENT_TYPES.join(', ')}`,
      );
    }
  }
}
