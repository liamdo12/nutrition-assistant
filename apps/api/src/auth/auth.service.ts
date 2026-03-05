import {
  BadRequestException,
  ConflictException,
  Injectable,
  InternalServerErrorException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { User } from '@prisma/client';
import {
  authResponseSchema,
  forgotPasswordResponseSchema,
  forgotPasswordSchema,
  loginSchema,
  logoutResponseSchema,
  registerSchema,
  resetPasswordResponseSchema,
  resetPasswordSchema,
  userProfileSchema,
} from '@nutrition/shared';
import { z } from 'zod';
import { AppConfig } from '../config/app.config';
import { PasswordResetMailerService } from '../common/email/password-reset-mailer.service';
import { JwtPayload, AuthTokenService } from '../common/security/auth-token.service';
import { parseDurationToSeconds } from '../common/security/duration.util';
import { PasswordHasherService } from '../common/security/password-hasher.service';
import { ResetTokenService } from '../common/security/reset-token.service';
import { parseWithSchema } from '../common/validation/zod-validation';
import { DomainEventsService } from '../events/domain-events.service';
import { AuthRepository } from './auth.repository';

const GENERIC_FORGOT_PASSWORD_MESSAGE = 'If the account exists, reset instructions were sent.';

@Injectable()
export class AuthService {
  constructor(
    private readonly authRepository: AuthRepository,
    private readonly passwordHasher: PasswordHasherService,
    private readonly tokenService: AuthTokenService,
    private readonly resetTokenService: ResetTokenService,
    private readonly passwordResetMailer: PasswordResetMailerService,
    private readonly configService: ConfigService<AppConfig, true>,
    private readonly domainEvents: DomainEventsService,
  ) {}

  async register(rawInput: unknown) {
    const input = parseWithSchema(registerSchema, rawInput);
    const existingUser = await this.authRepository.findByEmail(input.email);
    if (existingUser) {
      throw new ConflictException('Email is already in use');
    }

    const passwordHash = await this.passwordHasher.hash(input.password);
    const user = await this.authRepository.createUser({
      email: input.email,
      name: input.name,
      passwordHash,
    });

    this.domainEvents.publish({
      type: 'auth.user.registered',
      userId: user.id,
      payload: {
        email: user.email,
      },
    });

    return this.buildAuthResponse(user);
  }

  async login(rawInput: unknown) {
    const input = parseWithSchema(loginSchema, rawInput);
    const user = await this.authRepository.findByEmail(input.email);

    if (!user || !(await this.passwordHasher.verify(input.password, user.password))) {
      throw new UnauthorizedException('Invalid email or password');
    }

    this.domainEvents.publish({
      type: 'auth.user.logged_in',
      userId: user.id,
      payload: {
        email: user.email,
      },
    });

    return this.buildAuthResponse(user);
  }

  async getProfile(userId: string) {
    const user = await this.authRepository.findById(userId);
    if (!user) {
      throw new UnauthorizedException('Invalid authentication token');
    }

    return this.validateServerResponse(userProfileSchema, {
      id: user.id,
      email: user.email,
      name: user.name,
      createdAt: user.createdAt.toISOString(),
    });
  }

  async forgotPassword(rawInput: unknown) {
    const input = parseWithSchema(forgotPasswordSchema, rawInput);
    const user = await this.authRepository.findByEmail(input.email);

    if (!user) {
      return this.validateServerResponse(forgotPasswordResponseSchema, {
        message: GENERIC_FORGOT_PASSWORD_MESSAGE,
      });
    }

    const rawResetToken = this.resetTokenService.generate();
    const hashedResetToken = this.resetTokenService.hash(rawResetToken);
    const ttl = this.configService.get('RESET_PASSWORD_TOKEN_EXPIRES_IN', { infer: true });
    const expiresAt = new Date(
      Date.now() + parseDurationToSeconds(ttl, 'RESET_PASSWORD_TOKEN_EXPIRES_IN') * 1000,
    );

    await this.authRepository.createPasswordResetToken({
      userId: user.id,
      tokenHash: hashedResetToken,
      expiresAt,
    });
    await this.passwordResetMailer.sendPasswordResetEmail({
      toEmail: user.email,
      toName: user.name,
      token: rawResetToken,
      expiresAt,
    });

    this.domainEvents.publish({
      type: 'auth.password_reset.requested',
      userId: user.id,
      payload: {
        email: user.email,
      },
    });

    const nodeEnv = this.configService.get('NODE_ENV', { infer: true });
    const emailProvider = this.configService.get('EMAIL_PROVIDER', { infer: true });
    return this.validateServerResponse(forgotPasswordResponseSchema, {
      message: GENERIC_FORGOT_PASSWORD_MESSAGE,
      ...(nodeEnv !== 'production' && emailProvider === 'log' ? { resetToken: rawResetToken } : {}),
    });
  }

  async resetPassword(rawInput: unknown) {
    const input = parseWithSchema(resetPasswordSchema, rawInput);
    const tokenHash = this.resetTokenService.hash(input.token);
    const now = new Date();

    const resetToken = await this.authRepository.findActivePasswordResetTokenByHash(tokenHash, now);
    if (!resetToken) {
      throw new BadRequestException('Invalid or expired reset token');
    }

    const passwordHash = await this.passwordHasher.hash(input.newPassword);
    const updated = await this.authRepository.resetPasswordWithToken({
      resetTokenId: resetToken.id,
      userId: resetToken.userId,
      passwordHash,
      now,
    });

    if (!updated) {
      throw new BadRequestException('Invalid or expired reset token');
    }

    this.domainEvents.publish({
      type: 'auth.password_reset.completed',
      userId: resetToken.userId,
      payload: {},
    });

    return this.validateServerResponse(resetPasswordResponseSchema, {
      message: 'Password reset successfully',
    });
  }

  async logout(userId: string, payload: JwtPayload) {
    await this.authRepository.revokeToken({
      userId,
      jti: payload.jti,
      expiresAt: new Date(payload.exp * 1000),
    });

    this.domainEvents.publish({
      type: 'auth.user.logged_out',
      userId,
      payload: {
        jti: payload.jti,
      },
    });

    return this.validateServerResponse(logoutResponseSchema, {
      success: true,
    });
  }

  private buildAuthResponse(user: User) {
    const token = this.tokenService.sign({
      userId: user.id,
      email: user.email,
      name: user.name,
      tokenVersion: user.tokenVersion,
    });
    return this.validateServerResponse(authResponseSchema, {
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        createdAt: user.createdAt.toISOString(),
      },
      token,
    });
  }

  private validateServerResponse<T>(schema: z.ZodType<T>, rawValue: unknown): T {
    const parsed = schema.safeParse(rawValue);
    if (!parsed.success) {
      throw new InternalServerErrorException('Generated invalid response payload');
    }

    return parsed.data;
  }
}
