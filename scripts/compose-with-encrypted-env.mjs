#!/usr/bin/env node

/**
 * Wrapper around `docker compose` that injects decrypted env values in-memory.
 *
 * Why this exists:
 * - Compose can interpolate ${VAR} from parent process env.
 * - We can keep runtime flow based on `.env.encrypted` + `MASTER_KEY` only.
 * - No decrypted env file needs to be committed or persisted.
 *
 * Usage:
 *   node scripts/compose-with-encrypted-env.mjs up -d
 *   node scripts/compose-with-encrypted-env.mjs down
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
  throw new Error('MASTER_KEY is required in process.env to run docker compose.');
}

const encryptedPayload = readFileSync(encryptedPath, 'utf8').trim();
const decryptedEnv = parseEnv(decryptPayload(encryptedPayload, masterKey));
const mergedEnv = { ...decryptedEnv, ...process.env };

const composeArgs = process.argv.slice(2);
if (composeArgs.length === 0) {
  composeArgs.push('up', '-d');
}

const child = spawn('docker', ['compose', ...composeArgs], {
  stdio: 'inherit',
  shell: false,
  env: mergedEnv,
});

child.on('exit', code => {
  process.exit(code ?? 1);
});

child.on('error', error => {
  process.stderr.write(`${error.message}\n`);
  process.exit(1);
});

