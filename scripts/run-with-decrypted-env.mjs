#!/usr/bin/env node

import { createDecipheriv } from 'crypto';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { spawn } from 'child_process';

const ENCRYPTED_PREFIX = 'ENCv1:';

const toBase64 = value => {
  const base64 = value.replaceAll('-', '+').replaceAll('_', '/');
  return base64 + '='.repeat((4 - (base64.length % 4)) % 4);
};

const fromBase64Url = value => Buffer.from(toBase64(value), 'base64');

const parseEnvFile = content => {
  const lines = content.split(/\r?\n/);
  const parsed = {};
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) {
      continue;
    }
    const separatorIndex = trimmed.indexOf('=');
    if (separatorIndex < 0) {
      continue;
    }
    const key = trimmed.slice(0, separatorIndex);
    const value = trimmed.slice(separatorIndex + 1);
    parsed[key] = value;
  }
  return parsed;
};

const getKey = mergedEnv => {
  const keyBase64 = (mergedEnv.CONFIG_DECRYPTION_KEY ?? '').trim();
  if (keyBase64.length > 0) {
    const key = Buffer.from(keyBase64, 'base64');
    if (key.length !== 32) {
      throw new Error('CONFIG_DECRYPTION_KEY must be base64-encoded 32 bytes');
    }
    return key;
  }

  const keyFilePath = (mergedEnv.CONFIG_DECRYPTION_KEY_FILE ?? '').trim();
  if (keyFilePath.length === 0) {
    throw new Error('Missing CONFIG_DECRYPTION_KEY or CONFIG_DECRYPTION_KEY_FILE');
  }

  const content = readFileSync(keyFilePath, 'utf8').trim();
  const key = Buffer.from(content, 'base64');
  if (key.length !== 32) {
    throw new Error('CONFIG_DECRYPTION_KEY_FILE must contain base64-encoded 32 bytes');
  }
  return key;
};

const decryptIfNeeded = (key, envName, value) => {
  if (!value.startsWith(ENCRYPTED_PREFIX)) {
    return value;
  }

  const payload = value.slice(ENCRYPTED_PREFIX.length);
  const [ivPart, tagPart, cipherPart] = payload.split(':');
  if (ivPart === undefined || tagPart === undefined || cipherPart === undefined) {
    throw new Error(`Invalid encrypted payload for ${envName}`);
  }

  const iv = fromBase64Url(ivPart);
  const tag = fromBase64Url(tagPart);
  const ciphertext = fromBase64Url(cipherPart);

  const decipher = createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  decipher.setAAD(Buffer.from(`env:${envName}:v1`, 'utf8'));
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
};

const main = () => {
  const command = process.argv.slice(2).join(' ').trim();
  if (!command) {
    console.error('Usage: node scripts/run-with-decrypted-env.mjs <command>');
    process.exit(1);
  }

  const envPath = resolve(process.cwd(), '.env');
  const fileEnv = parseEnvFile(readFileSync(envPath, 'utf8'));
  const mergedEnv = { ...fileEnv, ...process.env };
  const key = getKey(mergedEnv);

  const runtimeEnv = { ...process.env, ...fileEnv };
  for (const [envName, rawValue] of Object.entries(runtimeEnv)) {
    if (typeof rawValue !== 'string') {
      continue;
    }
    runtimeEnv[envName] = decryptIfNeeded(key, envName, rawValue);
  }

  const child = spawn(command, {
    stdio: 'inherit',
    shell: true,
    env: runtimeEnv,
  });

  child.on('exit', code => {
    process.exit(code ?? 1);
  });
};

main();

