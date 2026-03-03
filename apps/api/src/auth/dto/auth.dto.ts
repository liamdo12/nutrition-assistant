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
import { createZodDto } from 'nestjs-zod';

export class RegisterBodyDto extends createZodDto(registerSchema) {}

export class LoginBodyDto extends createZodDto(loginSchema) {}

export class AuthResponseDto extends createZodDto(authResponseSchema) {}

export class UserProfileDto extends createZodDto(userProfileSchema) {}

export class ForgotPasswordBodyDto extends createZodDto(forgotPasswordSchema) {}

export class ResetPasswordBodyDto extends createZodDto(resetPasswordSchema) {}

export class ForgotPasswordResponseDto extends createZodDto(forgotPasswordResponseSchema) {}

export class ResetPasswordResponseDto extends createZodDto(resetPasswordResponseSchema) {}

export class LogoutResponseDto extends createZodDto(logoutResponseSchema) {}
