import { Module } from '@nestjs/common';
import { PasswordResetMailerService } from '../common/email/password-reset-mailer.service';
import { AuthTokenService } from '../common/security/auth-token.service';
import { PasswordHasherService } from '../common/security/password-hasher.service';
import { ResetTokenService } from '../common/security/reset-token.service';
import { AuthController } from './auth.controller';
import { AuthRepository } from './auth.repository';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './jwt-auth.guard';

@Module({
  controllers: [AuthController],
  providers: [
    AuthService,
    AuthRepository,
    PasswordHasherService,
    AuthTokenService,
    ResetTokenService,
    PasswordResetMailerService,
    JwtAuthGuard,
  ],
  exports: [AuthService, AuthRepository, AuthTokenService, JwtAuthGuard],
})
export class AuthModule {}
