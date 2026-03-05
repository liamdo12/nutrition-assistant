import { Injectable } from '@nestjs/common';
import { randomBytes, scrypt, timingSafeEqual } from 'crypto';
import { promisify } from 'util';

const SCRYPT_KEYLEN = 64;
const SALT_BYTES = 16;
const scryptAsync = promisify(scrypt);

@Injectable()
export class PasswordHasherService {
  async hash(plainPassword: string): Promise<string> {
    const salt = randomBytes(SALT_BYTES).toString('hex');
    const hashed = (await scryptAsync(plainPassword, salt, SCRYPT_KEYLEN)) as Buffer;
    return `${salt}:${hashed.toString('hex')}`;
  }

  async verify(plainPassword: string, storedPassword: string): Promise<boolean> {
    const [salt, expectedHashHex] = storedPassword.split(':');
    if (!salt || !expectedHashHex) {
      return false;
    }

    const actualHash = (await scryptAsync(plainPassword, salt, SCRYPT_KEYLEN)) as Buffer;
    const expectedHash = Buffer.from(expectedHashHex, 'hex');
    if (actualHash.length !== expectedHash.length) {
      return false;
    }

    return timingSafeEqual(actualHash, expectedHash);
  }
}
