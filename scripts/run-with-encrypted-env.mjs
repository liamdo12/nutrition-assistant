#!/usr/bin/env node

/**
 * Run any command with environment variables decrypted from `.env.encrypted`.
 *
 * Why this exists:
 * - Keep runtime dependent on encrypted config only.
 * - Allow CLI tools (Prisma, Nest dev) to receive decrypted env in-memory.
 * - Avoid writing decrypted env back to disk.
 *
 * Usage:
 *   node scripts/run-with-encrypted-env.mjs "yarn workspace @nutrition/api dev"
 *   node scripts/run-with-encrypted-env.mjs "yarn workspace @nutrition/api prisma:migrate:deploy"
 */

import { spawn } from 'child_process';
import { createDecipheriv, createHash } from 'crypto';
import { existsSync, readFileSync } from 'fs';
import { resolve } from 'path';

const ENCRYPTED_VERSION = 'v1';

const parseEnv = content => {
  const result = {};
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

const decryptPayload = (payload, masterKey) => {
  const [version, ivBase64, encryptedBase64] = payload.split(':');
  if (!version || !ivBase64 || !encryptedBase64 || version !== ENCRYPTED_VERSION) {
    throw new Error('Invalid .env.encrypted format. Expected v1:<iv-base64>:<cipher-base64>.');
  }

  const iv = Buffer.from(ivBase64, 'base64');
  if (iv.length !== 16) {
    throw new Error('Invalid IV length in .env.encrypted. Expected 16 bytes.');
  }

  const key = createHash('sha256').update(masterKey, 'utf8').digest();
  const decipher = createDecipheriv('aes-256-cbc', key, iv);
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(encryptedBase64, 'base64')),
    decipher.final(),
  ]);

  return decrypted.toString('utf8');
};

const encryptedPath = resolve(process.cwd(), process.env.ENV_ENCRYPTED_PATH ?? '.env.encrypted');
if (!existsSync(encryptedPath)) {
  throw new Error(`Encrypted env file not found: ${encryptedPath}`);
}

const masterKey = process.env.MASTER_KEY?.trim();
if (!masterKey) {
  throw new Error('MASTER_KEY is required in process.env to decrypt .env.encrypted.');
}

const command = process.argv.slice(2).join(' ').trim();
if (!command) {
  throw new Error('Missing command. Example: node scripts/run-with-encrypted-env.mjs "yarn dev:api"');
}

const encryptedPayload = readFileSync(encryptedPath, 'utf8').trim();
const decryptedEnv = parseEnv(decryptPayload(encryptedPayload, masterKey));
const mergedEnv = { ...decryptedEnv, ...process.env };

const child = spawn(command, {
  stdio: 'inherit',
  shell: true,
  env: mergedEnv,
});

child.on('exit', code => {
  process.exit(code ?? 1);
});

child.on('error', error => {
  process.stderr.write(`${error.message}\n`);
  process.exit(1);
});

