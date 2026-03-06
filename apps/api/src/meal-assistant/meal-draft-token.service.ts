import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, randomUUID, timingSafeEqual } from 'crypto';
import {
  MealDishSuggestion,
  mealDishSuggestionSchema,
  mealGeneratedRecipeSchema,
} from '@nutrition/shared';
import { z } from 'zod';
import { AppConfig } from '../config/app.config';

const analysisTokenPayloadSchema = z.object({
  jti: z.string().uuid(),
  typ: z.literal('meal.analysis'),
  sub: z.string().uuid(),
  iat: z.number().int().nonnegative(),
  exp: z.number().int().nonnegative(),
  data: z.object({
    inputImageUrl: z.string().url(),
    locale: z.string().min(2).max(20),
    constraints: z.string().max(1000).optional(),
    suggestions: z.array(mealDishSuggestionSchema).length(5),
    modelName: z.string().min(1).max(120),
  }),
});

const recipeTokenPayloadSchema = z.object({
  jti: z.string().uuid(),
  typ: z.literal('meal.recipe'),
  sub: z.string().uuid(),
  iat: z.number().int().nonnegative(),
  exp: z.number().int().nonnegative(),
  data: z.object({
    analysisJti: z.string().uuid(),
    selectedDishId: z.string().min(1).max(120),
    recipe: mealGeneratedRecipeSchema,
    modelName: z.string().min(1).max(120),
  }),
});

type AnalysisTokenPayload = z.infer<typeof analysisTokenPayloadSchema>;
type RecipeTokenPayload = z.infer<typeof recipeTokenPayloadSchema>;

interface SignAnalysisTokenInput {
  readonly userId: string;
  readonly inputImageUrl: string;
  readonly locale: string;
  readonly constraints?: string;
  readonly suggestions: MealDishSuggestion[];
  readonly modelName: string;
  readonly ttlSeconds?: number;
}

interface SignRecipeTokenInput {
  readonly userId: string;
  readonly analysisJti: string;
  readonly selectedDishId: string;
  readonly recipe: z.infer<typeof mealGeneratedRecipeSchema>;
  readonly modelName: string;
  readonly ttlSeconds?: number;
}

@Injectable()
export class MealDraftTokenService {
  private static readonly ANALYSIS_TTL_SECONDS = 15 * 60;
  private static readonly RECIPE_TTL_SECONDS = 20 * 60;

  constructor(private readonly configService: ConfigService<AppConfig, true>) {}

  signAnalysisToken(input: SignAnalysisTokenInput): {
    token: string;
    expiresAt: string;
    payload: AnalysisTokenPayload;
  } {
    const now = Math.floor(Date.now() / 1000);
    const exp = now + (input.ttlSeconds ?? MealDraftTokenService.ANALYSIS_TTL_SECONDS);
    const payload: AnalysisTokenPayload = {
      jti: randomUUID(),
      typ: 'meal.analysis',
      sub: input.userId,
      iat: now,
      exp,
      data: {
        inputImageUrl: input.inputImageUrl,
        locale: input.locale,
        constraints: input.constraints,
        suggestions: input.suggestions,
        modelName: input.modelName,
      },
    };

    return {
      token: this.signToken(payload),
      expiresAt: new Date(exp * 1000).toISOString(),
      payload,
    };
  }

  signRecipeToken(input: SignRecipeTokenInput): {
    token: string;
    expiresAt: string;
    payload: RecipeTokenPayload;
  } {
    const now = Math.floor(Date.now() / 1000);
    const exp = now + (input.ttlSeconds ?? MealDraftTokenService.RECIPE_TTL_SECONDS);
    const payload: RecipeTokenPayload = {
      jti: randomUUID(),
      typ: 'meal.recipe',
      sub: input.userId,
      iat: now,
      exp,
      data: {
        analysisJti: input.analysisJti,
        selectedDishId: input.selectedDishId,
        recipe: input.recipe,
        modelName: input.modelName,
      },
    };

    return {
      token: this.signToken(payload),
      expiresAt: new Date(exp * 1000).toISOString(),
      payload,
    };
  }

  verifyAnalysisToken(token: string, expectedUserId: string): AnalysisTokenPayload {
    const payload = this.verifyAndDecode(token);
    const parsed = analysisTokenPayloadSchema.safeParse(payload);
    if (!parsed.success) {
      throw new UnauthorizedException('Invalid analysis token');
    }
    if (parsed.data.sub !== expectedUserId) {
      throw new UnauthorizedException('Analysis token does not belong to this user');
    }
    this.ensureNotExpired(parsed.data.exp);
    return parsed.data;
  }

  verifyRecipeToken(token: string, expectedUserId: string): RecipeTokenPayload {
    const payload = this.verifyAndDecode(token);
    const parsed = recipeTokenPayloadSchema.safeParse(payload);
    if (!parsed.success) {
      throw new UnauthorizedException('Invalid recipe token');
    }
    if (parsed.data.sub !== expectedUserId) {
      throw new UnauthorizedException('Recipe token does not belong to this user');
    }
    this.ensureNotExpired(parsed.data.exp);
    return parsed.data;
  }

  private verifyAndDecode(token: string): unknown {
    const [encodedHeader, encodedPayload, encodedSignature] = token.split('.');
    if (!encodedHeader || !encodedPayload || !encodedSignature) {
      throw new UnauthorizedException('Invalid token format');
    }

    const secret = this.getDraftTokenSecret();
    const unsignedToken = `${encodedHeader}.${encodedPayload}`;
    const providedSignature = Buffer.from(encodedSignature, 'base64url');
    const expectedSignature = createHmac('sha256', secret).update(unsignedToken).digest();

    if (
      providedSignature.length !== expectedSignature.length ||
      !timingSafeEqual(providedSignature, expectedSignature)
    ) {
      throw new UnauthorizedException('Invalid token signature');
    }

    try {
      return JSON.parse(Buffer.from(encodedPayload, 'base64url').toString('utf8'));
    } catch {
      throw new UnauthorizedException('Invalid token payload');
    }
  }

  private signToken(payload: Record<string, unknown>): string {
    const header = this.encode({ alg: 'HS256', typ: 'JWT' });
    const body = this.encode(payload);
    const unsignedToken = `${header}.${body}`;
    const signature = createHmac('sha256', this.getDraftTokenSecret())
      .update(unsignedToken)
      .digest('base64url');
    return `${unsignedToken}.${signature}`;
  }

  private ensureNotExpired(exp: number): void {
    if (exp <= Math.floor(Date.now() / 1000)) {
      throw new UnauthorizedException('Token expired');
    }
  }

  private encode(value: Record<string, unknown>): string {
    return Buffer.from(JSON.stringify(value), 'utf8').toString('base64url');
  }

  private getDraftTokenSecret(): string {
    const jwtSecret = this.configService.get('JWT_SECRET', { infer: true });
    return `${jwtSecret}:meal-draft-token`;
  }
}
