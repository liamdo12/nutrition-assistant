#!/usr/bin/env node

/**
 * Encrypt `.env.local` -> `.env.encrypted` using AES-256-CBC.
 *
 * Why this exists:
 * - Keep app runtime compatible with process.env only.
 * - Allow shipping encrypted config while keeping MASTER_KEY outside git.
 *
 * Usage:
 *   node scripts/encrypt-env.mjs
 *   node scripts/encrypt-env.mjs .env.local .env.encrypted
 *
 * Notes:
 * - MASTER_KEY is read from process.env first, then falls back to MASTER_KEY inside source env file.
 * - MASTER_KEY is intentionally removed from encrypted payload before encryption.
 */

import { createCipheriv, createHash, randomBytes } from 'crypto';
import { existsSync, readFileSync, writeFileSync } from 'fs';
import { resolve } from 'path';

const SOURCE_ENV_PATH = resolve(process.cwd(), process.argv[2] ?? '.env.local');
const OUTPUT_ENCRYPTED_PATH = resolve(process.cwd(), process.argv[3] ?? '.env.encrypted');

/**
 * Minimal dotenv-style parser.
 * Supports lines like KEY=value and ignores comments/blank lines.
 */
const parseEnv = content => {
  const result = {};
  const lines = content.split(/\r?\n/);

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.length === 0 || trimmed.startsWith('#')) {
      continue;
    }

    const separatorIndex = trimmed.indexOf('=');
    if (separatorIndex < 0) {
      continue;
    }

    const key = trimmed.slice(0, separatorIndex).trim();
    const value = trimmed.slice(separatorIndex + 1).trim();
    result[key] = value;
  }

  return result;
};

/**
 * Remove MASTER_KEY from plaintext before encryption so key never appears in encrypted payload.
 */
const stripMasterKeyLine = content =>
  content
    .split(/\r?\n/)
    .filter(line => !line.trim().startsWith('MASTER_KEY='))
    .join('\n');

if (!existsSync(SOURCE_ENV_PATH)) {
  throw new Error(`Source env file not found: ${SOURCE_ENV_PATH}`);
}

const sourceContent = readFileSync(SOURCE_ENV_PATH, 'utf8');
const parsedEnv = parseEnv(sourceContent);

// MASTER_KEY is supplied by shell/CI/CD first, then local file as fallback for dev convenience.
const masterKey = process.env.MASTER_KEY?.trim() || parsedEnv.MASTER_KEY?.trim();
if (!masterKey) {
  throw new Error(
    'MASTER_KEY is missing. Set it in process.env or inside .env.local before encryption.',
  );
}
if (masterKey.startsWith('<') && masterKey.endsWith('>')) {
  throw new Error('MASTER_KEY is still a placeholder. Replace it with a real secret first.');
}

// Derive a 32-byte encryption key from MASTER_KEY for AES-256.
const key = createHash('sha256').update(masterKey, 'utf8').digest();

// AES-256-CBC requires a 16-byte IV.
const iv = randomBytes(16);
const cipher = createCipheriv('aes-256-cbc', key, iv);

const plaintextToEncrypt = stripMasterKeyLine(sourceContent);
const encrypted = Buffer.concat([
  cipher.update(plaintextToEncrypt, 'utf8'),
  cipher.final(),
]).toString('base64');

// File format: v1:<base64-iv>:<base64-ciphertext>
const payload = `v1:${iv.toString('base64')}:${encrypted}`;
writeFileSync(OUTPUT_ENCRYPTED_PATH, payload, 'utf8');

process.stdout.write(`Encrypted ${SOURCE_ENV_PATH} -> ${OUTPUT_ENCRYPTED_PATH}\n`);
