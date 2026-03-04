import { createDecipheriv } from 'crypto';
import { readFileSync } from 'fs';

const ENCRYPTED_PREFIX = 'ENCv1:';
const REQUIRED_ENCRYPTED_KEYS = [
  'JWT_SECRET',
  'POSTGRES_PASSWORD',
  'POSTGRES_USER',
  'POSTGRES_DB',
  'DATABASE_URL',
  'SMTP_HOST',
  'SMTP_PORT',
  'SMTP_USER',
  'SMTP_PASS',
] as const;

type EnvMap = Record<string, unknown>;

const toStringOrUndefined = (value: unknown): string | undefined => {
  if (typeof value !== 'string') {
    return undefined;
  }
  return value;
};

const fromBase64Url = (value: string): Buffer => {
  const base64 = value.replaceAll('-', '+').replaceAll('_', '/');
  const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
  return Buffer.from(padded, 'base64');
};

const getDecryptionKey = (env: EnvMap): Buffer | null => {
  const directKey = toStringOrUndefined(env.CONFIG_DECRYPTION_KEY);
  if (directKey && directKey.trim().length > 0) {
    const keyBuffer = Buffer.from(directKey.trim(), 'base64');
    if (keyBuffer.length !== 32) {
      throw new Error('CONFIG_DECRYPTION_KEY must be a base64-encoded 32-byte value');
    }
    return keyBuffer;
  }

  const keyFilePath = toStringOrUndefined(env.CONFIG_DECRYPTION_KEY_FILE);
  if (!keyFilePath || keyFilePath.trim().length === 0) {
    return null;
  }

  const fileContent = readFileSync(keyFilePath.trim(), 'utf8').trim();
  if (fileContent.length === 0) {
    throw new Error('CONFIG_DECRYPTION_KEY_FILE points to an empty file');
  }

  const keyBuffer = Buffer.from(fileContent, 'base64');
  if (keyBuffer.length !== 32) {
    throw new Error('CONFIG_DECRYPTION_KEY_FILE must contain a base64-encoded 32-byte value');
  }
  return keyBuffer;
};

const decryptValue = (rawValue: string, key: Buffer, envKeyName: string): string => {
  const payload = rawValue.slice(ENCRYPTED_PREFIX.length);
  const segments = payload.split(':');
  if (segments.length !== 3) {
    throw new Error(`Invalid encrypted value format for ${envKeyName}`);
  }

  const [ivPart, tagPart, cipherPart] = segments;
  const iv = fromBase64Url(ivPart);
  const authTag = fromBase64Url(tagPart);
  const ciphertext = fromBase64Url(cipherPart);

  if (iv.length !== 12) {
    throw new Error(`Invalid encrypted IV length for ${envKeyName}`);
  }
  if (authTag.length !== 16) {
    throw new Error(`Invalid encrypted auth tag length for ${envKeyName}`);
  }

  const decipher = createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(authTag);
  decipher.setAAD(Buffer.from(`env:${envKeyName}:v1`, 'utf8'));

  const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return decrypted.toString('utf8');
};

const isEncrypted = (value: unknown): value is string =>
  typeof value === 'string' && value.startsWith(ENCRYPTED_PREFIX);

export function resolveEncryptedEnv(rawConfig: EnvMap): EnvMap {
  const resolved: EnvMap = { ...rawConfig };
  const requireEncrypted = (toStringOrUndefined(rawConfig.CONFIG_REQUIRE_ENCRYPTED) ?? 'true') === 'true';
  const key = getDecryptionKey(rawConfig);

  if (requireEncrypted && !key) {
    throw new Error(
      'Missing decryption key. Set CONFIG_DECRYPTION_KEY or CONFIG_DECRYPTION_KEY_FILE in runtime environment.',
    );
  }

  for (const envKeyName of REQUIRED_ENCRYPTED_KEYS) {
    const currentValue = toStringOrUndefined(rawConfig[envKeyName]);
    if (currentValue === undefined) {
      continue;
    }

    if (isEncrypted(currentValue)) {
      if (!key) {
        throw new Error(`Cannot decrypt ${envKeyName} without CONFIG_DECRYPTION_KEY`);
      }
      const decryptedValue = decryptValue(currentValue, key, envKeyName);
      resolved[envKeyName] = decryptedValue;
      process.env[envKeyName] = decryptedValue;
      continue;
    }

    if (requireEncrypted) {
      throw new Error(
        `${envKeyName} must be encrypted with ENCv1 format when CONFIG_REQUIRE_ENCRYPTED=true`,
      );
    }
  }

  return resolved;
}
