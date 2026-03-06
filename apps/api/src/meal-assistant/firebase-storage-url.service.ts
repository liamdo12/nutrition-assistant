import { BadRequestException, Injectable } from '@nestjs/common';

const ALLOWED_HOSTS = new Set(['firebasestorage.googleapis.com', 'storage.googleapis.com']);

@Injectable()
export class FirebaseStorageUrlService {
  validateImageUrl(rawUrl: string, fieldName: string): string {
    let parsed: URL;
    try {
      parsed = new URL(rawUrl);
    } catch {
      throw new BadRequestException(`${fieldName} must be a valid URL`);
    }

    if (parsed.protocol !== 'https:') {
      throw new BadRequestException(`${fieldName} must use HTTPS`);
    }

    if (!ALLOWED_HOSTS.has(parsed.hostname)) {
      throw new BadRequestException(`${fieldName} must be a Firebase Storage or GCS URL`);
    }

    return parsed.toString();
  }
}
