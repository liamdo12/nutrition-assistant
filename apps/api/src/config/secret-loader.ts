import { createDecipheriv, createHash } from 'crypto';
import { existsSync, readFileSync } from 'fs';
import { resolve } from 'path';

const ENCRYPTED_VERSION = 'v1';

/**
 * Minimal dotenv parser used for decrypted content.
 * Keeps this loader dependency-free and predictable across environments.
 */
const parseEnvText = (content: string): Record<string, string> => {
  const result: Record<string, string> = {};
  const lines = content.split(/\r?\n/);

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) {
      continue;
    }

    const separatorIndex = trimmed.indexOf('=');
    if (separatorIndex < 0) {
      continue;
    }

    const key = trimmed.slice(0, separatorIndex).trim();
    let value = trimmed.slice(separatorIndex + 1).trim();

    // Strip simple wrapping quotes to make env parsing friendlier.
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    result[key] = value;
  }

  return result;
};

const findFirstExistingPath = (paths: string[]): string | null => {
  for (const candidate of paths) {
    if (candidate && existsSync(candidate)) {
      return candidate;
    }
  }
  return null;
};

const resolveMasterKey = (): string | null => process.env.MASTER_KEY?.trim() ?? null;

const decryptPayload = (payload: string, masterKey: string): string => {
  const [version, ivBase64, encryptedBase64] = payload.split(':');
  if (!version || !ivBase64 || !encryptedBase64 || version !== ENCRYPTED_VERSION) {
    throw new Error('Invalid .env.encrypted format. Expected v1:<iv-base64>:<cipher-base64>.');
  }

  const iv = Buffer.from(ivBase64, 'base64');
  if (iv.length !== 16) {
    throw new Error('Invalid IV length in .env.encrypted. Expected 16 bytes.');
  }

  // Derive the AES key exactly as in the encrypt script.
  const key = createHash('sha256').update(masterKey, 'utf8').digest();
  const decipher = createDecipheriv('aes-256-cbc', key, iv);
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(encryptedBase64, 'base64')),
    decipher.final(),
  ]);

  return decrypted.toString('utf8');
};

export const loadEncryptedEnvIntoProcessEnv = (): void => {
  const encryptedPath = findFirstExistingPath([
    process.env.ENV_ENCRYPTED_PATH ? resolve(process.cwd(), process.env.ENV_ENCRYPTED_PATH) : '',
    resolve(process.cwd(), '.env.encrypted'),
    resolve(process.cwd(), '../../.env.encrypted'),
    resolve(__dirname, '../../../../.env.encrypted'),
  ]);

  if (!encryptedPath) {
    // In production (Cloud Run), env vars come from Secret Manager / env_vars directly.
    // Skip decryption when .env.encrypted is absent and DATABASE_URL is already set.
    if (process.env.DATABASE_URL) {
      return;
    }
    throw new Error(
      '.env.encrypted not found. Runtime requires encrypted env file via default path or ENV_ENCRYPTED_PATH.',
    );
  }

  const masterKey = resolveMasterKey();
  if (!masterKey) {
    throw new Error(
      'MASTER_KEY is required to decrypt .env.encrypted. Inject it via platform secret/runtime environment.',
    );
  }

  const encryptedPayload = readFileSync(encryptedPath, 'utf8').trim();
  const decryptedEnv = decryptPayload(encryptedPayload, masterKey);
  const parsedDecryptedEnv = parseEnvText(decryptedEnv);

  for (const [key, value] of Object.entries(parsedDecryptedEnv)) {
    // Keep explicit runtime/platform values as highest priority.
    if (process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
};

// Execute on import so secrets are available before Nest bootstraps modules.
loadEncryptedEnvIntoProcessEnv();
