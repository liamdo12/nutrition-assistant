#!/usr/bin/env node

import { createCipheriv, randomBytes } from 'crypto';
import { readFileSync, writeFileSync } from 'fs';
import { resolve } from 'path';

const ENCRYPTED_PREFIX = 'ENCv1:';

const toBase64Url = value =>
  value
    .toString('base64')
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replace(/=+$/g, '');

const fromBase64 = value => Buffer.from(value, 'base64');

const parseArgs = argv => {
  const args = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith('--')) {
      continue;
    }
    const key = token.slice(2);
    const next = argv[index + 1];
    if (!next || next.startsWith('--')) {
      args[key] = 'true';
      continue;
    }
    args[key] = next;
    index += 1;
  }
  return args;
};

const usage = () => {
  console.error(
    [
      'Usage:',
      '  node apps/api/scripts/env-crypto.mjs keygen',
      '  node apps/api/scripts/env-crypto.mjs encrypt-value --name <ENV_KEY> --value <PLAINTEXT> [--key <BASE64_32B>]',
      '  node apps/api/scripts/env-crypto.mjs encrypt-env --file <ENV_FILE> --keys <K1,K2,...> [--key <BASE64_32B>]',
      '',
      'Notes:',
      '  - If --key is omitted, script reads CONFIG_DECRYPTION_KEY from process environment.',
      '  - Output format: ENCv1:<iv>:<tag>:<ciphertext>',
    ].join('\n'),
  );
};

const readKey = args => {
  const raw = (args.key ?? process.env.CONFIG_DECRYPTION_KEY ?? '').trim();
  if (raw.length === 0) {
    throw new Error('Missing key. Pass --key or set CONFIG_DECRYPTION_KEY.');
  }
  const key = fromBase64(raw);
  if (key.length !== 32) {
    throw new Error('Key must be base64-encoded 32 bytes.');
  }
  return key;
};

const encrypt = (envName, plaintext, key) => {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  cipher.setAAD(Buffer.from(`env:${envName}:v1`, 'utf8'));

  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${ENCRYPTED_PREFIX}${toBase64Url(iv)}:${toBase64Url(tag)}:${toBase64Url(ciphertext)}`;
};

const replaceEnvValue = (content, envName, encryptedValue) => {
  const escapedName = envName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const matcher = new RegExp(`^(${escapedName}=).*$`, 'm');
  if (!matcher.test(content)) {
    throw new Error(`Key ${envName} not found in env file`);
  }
  return content.replace(matcher, `$1${encryptedValue}`);
};

const main = () => {
  const [command, ...rest] = process.argv.slice(2);
  const args = parseArgs(rest);

  if (!command) {
    usage();
    process.exit(1);
  }

  if (command === 'keygen') {
    const key = randomBytes(32).toString('base64');
    process.stdout.write(`${key}\n`);
    return;
  }

  if (command === 'encrypt-value') {
    if (!args.name || args.value === undefined) {
      usage();
      process.exit(1);
    }
    const key = readKey(args);
    process.stdout.write(`${encrypt(args.name, String(args.value), key)}\n`);
    return;
  }

  if (command === 'encrypt-env') {
    if (!args.file || !args.keys) {
      usage();
      process.exit(1);
    }
    const key = readKey(args);
    const filePath = resolve(process.cwd(), args.file);
    const keys = String(args.keys)
      .split(',')
      .map(value => value.trim())
      .filter(Boolean);

    let envContent = readFileSync(filePath, 'utf8');
    for (const envName of keys) {
      const currentMatcher = new RegExp(`^${envName}=(.*)$`, 'm');
      const match = envContent.match(currentMatcher);
      if (!match) {
        throw new Error(`Key ${envName} not found in ${args.file}`);
      }
      const currentValue = match[1] ?? '';
      const encryptedValue = currentValue.startsWith(ENCRYPTED_PREFIX)
        ? currentValue
        : encrypt(envName, currentValue, key);

      envContent = replaceEnvValue(envContent, envName, encryptedValue);
    }

    writeFileSync(filePath, envContent, 'utf8');
    process.stdout.write(`Encrypted ${keys.length} key(s) in ${args.file}\n`);
    return;
  }

  usage();
  process.exit(1);
};

main();
