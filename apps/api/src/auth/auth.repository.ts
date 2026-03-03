import { Injectable } from '@nestjs/common';
import { PasswordResetToken, User } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';

@Injectable()
export class AuthRepository {
  constructor(private readonly prisma: PrismaService) {}

  findByEmail(email: string): Promise<User | null> {
    return this.prisma.user.findUnique({ where: { email } });
  }

  findById(id: string): Promise<User | null> {
    return this.prisma.user.findUnique({ where: { id } });
  }

  createUser(input: { email: string; name: string; passwordHash: string }): Promise<User> {
    return this.prisma.user.create({
      data: {
        email: input.email,
        name: input.name,
        password: input.passwordHash,
      },
    });
  }

  createPasswordResetToken(input: {
    userId: string;
    tokenHash: string;
    expiresAt: Date;
  }): Promise<PasswordResetToken> {
    return this.prisma.passwordResetToken.create({
      data: {
        userId: input.userId,
        tokenHash: input.tokenHash,
        expiresAt: input.expiresAt,
      },
    });
  }

  findActivePasswordResetTokenByHash(tokenHash: string, now: Date): Promise<PasswordResetToken | null> {
    return this.prisma.passwordResetToken.findFirst({
      where: {
        tokenHash,
        usedAt: null,
        expiresAt: {
          gt: now,
        },
      },
    });
  }

  async resetPasswordWithToken(input: {
    resetTokenId: string;
    userId: string;
    passwordHash: string;
    now: Date;
  }): Promise<boolean> {
    return this.prisma.$transaction(async tx => {
      const consumedToken = await tx.passwordResetToken.updateMany({
        where: {
          id: input.resetTokenId,
          userId: input.userId,
          usedAt: null,
          expiresAt: {
            gt: input.now,
          },
        },
        data: {
          usedAt: input.now,
        },
      });

      if (consumedToken.count !== 1) {
        return false;
      }

      await tx.user.update({
        where: { id: input.userId },
        data: {
          password: input.passwordHash,
          tokenVersion: {
            increment: 1,
          },
        },
      });

      return true;
    });
  }

  revokeToken(input: { jti: string; userId: string; expiresAt: Date }): Promise<void> {
    return this.prisma.revokedToken
      .upsert({
        where: { jti: input.jti },
        update: {
          expiresAt: input.expiresAt,
          userId: input.userId,
        },
        create: {
          jti: input.jti,
          userId: input.userId,
          expiresAt: input.expiresAt,
        },
      })
      .then(() => undefined);
  }

  async isTokenRevoked(jti: string, now: Date): Promise<boolean> {
    const revoked = await this.prisma.revokedToken.findFirst({
      where: {
        jti,
        expiresAt: {
          gt: now,
        },
      },
      select: { id: true },
    });

    return Boolean(revoked);
  }
}
