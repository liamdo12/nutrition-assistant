import { PrismaClient, UserRole } from '@prisma/client';
import { randomBytes, scrypt } from 'crypto';
import { promisify } from 'util';

const SCRYPT_KEYLEN = 64;
const SALT_BYTES = 16;
const scryptAsync = promisify(scrypt);

async function hashPassword(plain: string): Promise<string> {
  const salt = randomBytes(SALT_BYTES).toString('hex');
  const hashed = (await scryptAsync(plain, salt, SCRYPT_KEYLEN)) as Buffer;
  return `${salt}:${hashed.toString('hex')}`;
}

const ADMIN_EMAIL = 'admin@admin.com';
const ADMIN_PASSWORD = 'admin123123';
const ADMIN_NAME = 'Admin';

async function main() {
  const prisma = new PrismaClient();

  try {
    const passwordHash = await hashPassword(ADMIN_PASSWORD);

    const admin = await prisma.user.upsert({
      where: { email: ADMIN_EMAIL },
      update: { role: UserRole.ADMIN },
      create: {
        email: ADMIN_EMAIL,
        name: ADMIN_NAME,
        password: passwordHash,
        role: UserRole.ADMIN,
      },
    });

    console.log(`Admin user seeded: ${admin.email} (id: ${admin.id})`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error('Seed failed:', error);
  process.exit(1);
});
