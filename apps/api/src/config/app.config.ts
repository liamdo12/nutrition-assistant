import { z } from 'zod';

const parseOrigins = (value: string): string[] =>
  value
    .split(',')
    .map(origin => origin.trim())
    .filter(origin => origin.length > 0);

const optionalNonEmptyString = z.preprocess(
  value => (value === '' ? undefined : value),
  z.string().min(1).optional(),
);

const optionalPositivePort = z.preprocess(
  value => (value === '' ? undefined : value),
  z.coerce.number().int().positive().optional(),
);

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().default(3000),
  DATABASE_URL: z.string().url(),
  JWT_SECRET: z.string().min(16),
  JWT_EXPIRES_IN: z.string().default('7d'),
  RESET_PASSWORD_TOKEN_EXPIRES_IN: z.string().default('30m'),
  APP_BASE_URL: z.string().url().default('http://localhost:8081'),
  EMAIL_PROVIDER: z.enum(['log', 'smtp', 'resend']).default('log'),
  EMAIL_FROM: z.string().email().default('no-reply@nutrition-assistant.local'),
  SMTP_HOST: optionalNonEmptyString,
  SMTP_PORT: optionalPositivePort,
  SMTP_USER: optionalNonEmptyString,
  SMTP_PASS: optionalNonEmptyString,
  SMTP_SECURE: z
    .enum(['true', 'false'])
    .default('false')
    .transform(value => value === 'true'),
  RESEND_API_KEY: optionalNonEmptyString,
  GCS_BUCKET_NAME: optionalNonEmptyString,
  GCP_PROJECT_ID: optionalNonEmptyString,
  CORS_ORIGINS: z
    .string()
    .default('http://localhost:3000,http://localhost:8081')
    .transform(parseOrigins),
}).superRefine((env, context) => {
  if (env.EMAIL_PROVIDER === 'smtp') {
    if (!env.SMTP_HOST) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['SMTP_HOST'],
        message: 'SMTP_HOST is required when EMAIL_PROVIDER=smtp',
      });
    }
    if (!env.SMTP_PORT) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['SMTP_PORT'],
        message: 'SMTP_PORT is required when EMAIL_PROVIDER=smtp',
      });
    }
    if (!env.SMTP_USER) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['SMTP_USER'],
        message: 'SMTP_USER is required when EMAIL_PROVIDER=smtp',
      });
    }
    if (!env.SMTP_PASS) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['SMTP_PASS'],
        message: 'SMTP_PASS is required when EMAIL_PROVIDER=smtp',
      });
    }
  }

  if (env.EMAIL_PROVIDER === 'resend' && !env.RESEND_API_KEY) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['RESEND_API_KEY'],
      message: 'RESEND_API_KEY is required when EMAIL_PROVIDER=resend',
    });
  }
});

export type AppConfig = z.infer<typeof envSchema>;

export function validateEnv(config: Record<string, unknown>): AppConfig {
  const result = envSchema.safeParse(config);
  if (!result.success) {
    throw new Error(`Invalid environment variables:\n${result.error.message}`);
  }

  return result.data;
}
