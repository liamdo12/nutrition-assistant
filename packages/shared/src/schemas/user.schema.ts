import { z } from 'zod';

const passwordSchema = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .max(128, 'Password must be at most 128 characters');

const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .email('Email is invalid');

export const registerSchema = z.object({
  email: emailSchema,
  name: z.string().trim().min(2, 'Name is too short').max(100, 'Name is too long'),
  password: passwordSchema,
});

export const loginSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
});

export const forgotPasswordSchema = z.object({
  email: emailSchema,
});

export const resetPasswordSchema = z.object({
  token: z.string().trim().min(20).max(500),
  newPassword: passwordSchema,
});

export const userProfileSchema = z.object({
  id: z.string().uuid(),
  email: z.string().email(),
  name: z.string(),
  createdAt: z.string().datetime(),
});

export const authResponseSchema = z.object({
  user: userProfileSchema,
  token: z.string().min(1),
});

export const forgotPasswordResponseSchema = z.object({
  message: z.string().min(1),
  resetToken: z.string().min(1).optional(),
});

export const resetPasswordResponseSchema = z.object({
  message: z.string().min(1),
});

export const logoutResponseSchema = z.object({
  success: z.literal(true),
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;
export type UserProfile = z.infer<typeof userProfileSchema>;
export type AuthResponse = z.infer<typeof authResponseSchema>;
export type ForgotPasswordResponse = z.infer<typeof forgotPasswordResponseSchema>;
export type ResetPasswordResponse = z.infer<typeof resetPasswordResponseSchema>;
export type LogoutResponse = z.infer<typeof logoutResponseSchema>;
