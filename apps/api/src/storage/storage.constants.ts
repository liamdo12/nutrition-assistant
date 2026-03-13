export const SIGNED_URL_UPLOAD_EXPIRY_MS = 15 * 60 * 1000; // 15 minutes
export const SIGNED_URL_DOWNLOAD_EXPIRY_MS = 24 * 60 * 60 * 1000; // 24 hours
export const ALLOWED_CONTENT_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
] as const;
export const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB
