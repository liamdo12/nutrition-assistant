import {
  BadGatewayException,
  BadRequestException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import {
  MealDishSuggestion,
  mealAnalyzeImageResponseSchema,
  mealAnalyzeTextRequestSchema,
  mealAnalyzeTextResponseSchema,
  mealContextResetResponseSchema,
  mealGenerateRecipeRequestSchema,
  mealGenerateRecipeResponseSchema,
  mealHistoryDetailResponseSchema,
  mealHistoryQuerySchema,
  mealHistoryResponseSchema,
  mealSaveRequestSchema,
  mealSaveResponseSchema,
  mealSuggestDishesRequestSchema,
  mealSuggestDishesResponseSchema,
} from '@nutrition/shared';
import { Prisma } from '@prisma/client';
import { AuthenticatedUser } from '../common/auth/authenticated-user.type';
import { parseWithSchema } from '../common/validation/zod-validation';
import { PrismaService } from '../database/prisma.service';
import { DomainEventsService } from '../events/domain-events.service';
import { FirebaseStorageUrlService } from './firebase-storage-url.service';
import { GeminiService } from './gemini.service';
import { MealDraftTokenService } from './meal-draft-token.service';
import { SharedMealContextService } from './shared-meal-context.service';
import { z } from 'zod';

@Injectable()
export class MealAssistantService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly domainEvents: DomainEventsService,
    private readonly firebaseStorageUrlService: FirebaseStorageUrlService,
    private readonly geminiService: GeminiService,
    private readonly draftTokenService: MealDraftTokenService,
    private readonly sharedMealContextService: SharedMealContextService,
  ) {}

  async suggestDishes(user: AuthenticatedUser, rawInput: unknown) {
    const input = parseWithSchema(mealSuggestDishesInternalRequestSchema, rawInput);
    const inputImageUrl = input.inputImageUrl
      ? this.firebaseStorageUrlService.validateImageUrl(input.inputImageUrl, 'inputImageUrl')
      : undefined;

    const hasInlineImage = Boolean(input.imageBase64 && input.imageMimeType);
    const hasImageUrl = Boolean(inputImageUrl);

    if (!hasInlineImage && !hasImageUrl) {
      throw new BadRequestException(
        'Provide either an uploaded image file or inputImageUrl for suggest-dishes',
      );
    }

    this.domainEvents.publish({
      type: 'meal.suggest.requested',
      userId: user.id,
      payload: {
        locale: input.locale,
      },
    });

    try {
      let analyzeResult: Awaited<ReturnType<typeof this.geminiService.analyzeFoodFromImage>>;
      try {
        analyzeResult = await this.geminiService.analyzeFoodFromImage({
          imageBase64: input.imageBase64,
          imageMimeType: input.imageMimeType,
          inputImageUrl,
          locale: input.locale,
          constraints: input.constraints,
        });
      } catch (aiError) {
        const isBadGateway =
          aiError instanceof BadGatewayException ||
          (aiError instanceof Error && aiError.message.includes('invalid structured output'));
        if (isBadGateway) {
          throw new BadRequestException(
            'Could not analyze food from this photo. Please try a clearer image with visible food items.',
          );
        }
        throw aiError;
      }

      this.sharedMealContextService.mergeImageAnalysis(user.id, {
        locale: input.locale,
        constraints: input.constraints,
        analysis: analyzeResult.analysis,
      });

      const signed = this.draftTokenService.signAnalysisToken({
        userId: user.id,
        inputImageUrl,
        locale: input.locale,
        constraints: input.constraints,
        analysis: analyzeResult.analysis,
        estimatedNutrition: analyzeResult.estimatedNutrition,
        modelName: analyzeResult.modelName,
      });

      this.domainEvents.publish({
        type: 'meal.suggest.completed',
        userId: user.id,
        payload: {
          analysisJti: signed.payload.jti,
          detectedFoods: analyzeResult.analysis.detected.foods.length,
        },
      });

      return parseWithSchema(mealAnalyzeImageResponseSchema, {
        analysis: analyzeResult.analysis,
        estimatedNutrition: analyzeResult.estimatedNutrition,
        analysisToken: signed.token,
        modelInfo: {
          provider: 'gemini',
          model: analyzeResult.modelName,
        },
        expiresAt: signed.expiresAt,
      });
    } catch (error) {
      this.domainEvents.publish({
        type: 'meal.suggest.failed',
        userId: user.id,
        payload: {
          error: error instanceof Error ? error.message : 'Unknown error',
        },
      });
      throw error;
    }
  }

  async analyzeText(user: AuthenticatedUser, rawInput: unknown) {
    const input = parseWithSchema(mealAnalyzeTextRequestSchema, rawInput);

    this.domainEvents.publish({
      type: 'meal.text-analysis.requested',
      userId: user.id,
      payload: {
        locale: input.locale,
      },
    });

    try {
      const result = await this.geminiService.analyzeFoodText({
        text: input.text,
        locale: input.locale,
        constraints: input.constraints,
        sharedContext: this.sharedMealContextService.buildPromptContext(user.id),
      });

      this.sharedMealContextService.mergeTextTurn(user.id, 'user', input.text);
      this.sharedMealContextService.mergeTextAnalysis(user.id, {
        locale: input.locale,
        constraints: input.constraints,
        analysis: result.analysis,
      });
      this.sharedMealContextService.mergeTextTurn(user.id, 'model', result.analysis.assistantReply);

      this.domainEvents.publish({
        type: 'meal.text-analysis.completed',
        userId: user.id,
        payload: {
          detectedFoods: result.analysis.detected.foods.length,
          missingCount: result.analysis.missing.length,
        },
      });

      return parseWithSchema(mealAnalyzeTextResponseSchema, {
        analysis: result.analysis,
        modelInfo: {
          provider: 'gemini',
          model: result.modelName,
        },
      });
    } catch (error) {
      this.domainEvents.publish({
        type: 'meal.text-analysis.failed',
        userId: user.id,
        payload: {
          error: error instanceof Error ? error.message : 'Unknown error',
        },
      });
      throw error;
    }
  }

  async generateRecipe(user: AuthenticatedUser, rawInput: unknown) {
    const input = parseWithSchema(mealGenerateRecipeRequestSchema, rawInput);
    const analysisPayload = this.draftTokenService.verifyAnalysisToken(input.analysisToken, user.id);
    const suggestions = analysisPayload.data.suggestions ?? [];
    const selectedDish = suggestions.find(dish => dish.id === input.selectedDishId);

    if (!selectedDish) {
      throw new UnauthorizedException('selectedDishId is not part of the signed analysis token');
    }

    this.domainEvents.publish({
      type: 'meal.recipe.requested',
      userId: user.id,
      payload: {
        analysisJti: analysisPayload.jti,
        selectedDishId: selectedDish.id,
      },
    });

    try {
      const generated = await this.geminiService.generateRecipe({
        locale: analysisPayload.data.locale,
        selectedDish,
        suggestions,
        servings: input.servings,
        preferences: input.preferences,
        sharedContext: this.sharedMealContextService.buildPromptContext(user.id),
      });

      this.sharedMealContextService.mergeMealSelection(user.id, {
        selectedDishId: selectedDish.id,
        selectedDishName: selectedDish.name,
        preferences: input.preferences,
      });

      const signed = this.draftTokenService.signRecipeToken({
        userId: user.id,
        analysisJti: analysisPayload.jti,
        selectedDishId: selectedDish.id,
        recipe: generated.recipe,
        modelName: generated.modelName,
      });

      this.domainEvents.publish({
        type: 'meal.recipe.completed',
        userId: user.id,
        payload: {
          analysisJti: analysisPayload.jti,
          recipeJti: signed.payload.jti,
        },
      });

      return parseWithSchema(mealGenerateRecipeResponseSchema, {
        recipe: generated.recipe,
        recipeToken: signed.token,
        modelInfo: {
          provider: 'gemini',
          model: generated.modelName,
        },
        expiresAt: signed.expiresAt,
      });
    } catch (error) {
      this.domainEvents.publish({
        type: 'meal.recipe.failed',
        userId: user.id,
        payload: {
          analysisJti: analysisPayload.jti,
          error: error instanceof Error ? error.message : 'Unknown error',
        },
      });
      throw error;
    }
  }

  async save(user: AuthenticatedUser, rawInput: unknown) {
    const input = parseWithSchema(mealSaveRequestSchema, rawInput);
    const analysisPayload = this.draftTokenService.verifyAnalysisToken(input.analysisToken, user.id);
    const recipePayload = this.draftTokenService.verifyRecipeToken(input.recipeToken, user.id);

    if (analysisPayload.jti !== recipePayload.data.analysisJti) {
      throw new UnauthorizedException('Recipe token does not match analysis token');
    }

    const selectedDish = this.requireSelectedDish(
      analysisPayload.data.suggestions ?? [],
      recipePayload.data.selectedDishId,
    );
    const inputImageUrl = analysisPayload.data.inputImageUrl
      ? this.firebaseStorageUrlService.validateImageUrl(
          analysisPayload.data.inputImageUrl,
          'analysisToken.inputImageUrl',
        )
      : null;

    if (!inputImageUrl) {
      throw new BadRequestException(
        'analysisToken is missing inputImageUrl. Pass inputImageUrl in suggest-dishes if you want to save result history.',
      );
    }

    const cookedImageUrl = this.firebaseStorageUrlService.validateImageUrl(
      input.cookedImageUrl,
      'cookedImageUrl',
    );

    const ateAt = input.ateAt ? new Date(input.ateAt) : null;
    const recipe = recipePayload.data.recipe;

    const created = await this.prisma.$transaction(async tx => {
      const recipeRecord = await tx.recipe.create({
        data: {
          userId: user.id,
          language: analysisPayload.data.locale,
          inputImageUrl,
          recipeTitle: recipe.title,
          selectedDishName: selectedDish.name,
          selectedDishReason: selectedDish.reason,
          suggestionsJson: (analysisPayload.data.suggestions ?? []) as unknown as Prisma.InputJsonValue,
          ingredientsJson: recipe.ingredients as unknown as Prisma.InputJsonValue,
          stepsJson: recipe.steps as unknown as Prisma.InputJsonValue,
          notesJson: recipe.notes as unknown as Prisma.InputJsonValue,
          nutritionJson: (recipe.nutritionEstimate ?? null) as unknown as Prisma.InputJsonValue,
          modelName: recipePayload.data.modelName,
        },
      });

      await tx.recipeFeedback.create({
        data: {
          recipeId: recipeRecord.id,
          userId: user.id,
          rating: input.rating,
          note: input.note,
          ateAt,
        },
      });

      await tx.recipeImage.createMany({
        data: [
          {
            recipeId: recipeRecord.id,
            kind: 'INPUT',
            imageUrl: inputImageUrl,
          },
          {
            recipeId: recipeRecord.id,
            kind: 'COOKED',
            imageUrl: cookedImageUrl,
          },
        ],
      });

      if (recipe.nutritionEstimate) {
        await tx.nutritionLog.create({
          data: {
            userId: user.id,
            foodName: selectedDish.name,
            calories: recipe.nutritionEstimate.calories,
            protein: recipe.nutritionEstimate.protein,
            carbs: recipe.nutritionEstimate.carbs,
            fats: recipe.nutritionEstimate.fats,
          },
        });
      }

      return recipeRecord;
    });

    this.domainEvents.publish({
      type: 'meal.saved',
      userId: user.id,
      payload: {
        recipeId: created.id,
        rating: input.rating,
      },
    });

    this.resetSharedContext(user.id, 'meal_saved');

    return parseWithSchema(mealSaveResponseSchema, {
      savedId: created.id,
      createdAt: created.createdAt.toISOString(),
    });
  }

  resetContext(user: AuthenticatedUser) {
    this.resetSharedContext(user.id, 'manual_reset');
    return parseWithSchema(mealContextResetResponseSchema, {
      reset: true,
      resetAt: new Date().toISOString(),
    });
  }

  async getHistory(user: AuthenticatedUser, rawQuery: unknown) {
    const query = parseWithSchema(mealHistoryQuerySchema, rawQuery);
    const skip = (query.page - 1) * query.pageSize;
    const [items, total] = await Promise.all([
      this.prisma.recipe.findMany({
        where: { userId: user.id },
        include: {
          feedback: true,
          images: true,
        },
        orderBy: {
          createdAt: 'desc',
        },
        skip,
        take: query.pageSize,
      }),
      this.prisma.recipe.count({
        where: { userId: user.id },
      }),
    ]);

    return parseWithSchema(mealHistoryResponseSchema, {
      items: items
        .map(item => {
          const cookedImage = item.images.find(image => image.kind === 'COOKED');
          return {
            id: item.id,
            selectedDishName: item.selectedDishName,
            rating: item.feedback?.rating ?? 0,
            inputImageUrl: item.inputImageUrl,
            cookedImageUrl: cookedImage?.imageUrl ?? item.inputImageUrl,
            createdAt: item.createdAt.toISOString(),
          };
        })
        .filter(item => item.rating > 0),
      page: query.page,
      pageSize: query.pageSize,
      total,
    });
  }

  async getHistoryDetail(user: AuthenticatedUser, id: string) {
    const recipe = await this.prisma.recipe.findFirst({
      where: {
        id,
        userId: user.id,
      },
      include: {
        feedback: true,
        images: true,
      },
    });

    if (!recipe || !recipe.feedback) {
      throw new NotFoundException('Saved recipe not found');
    }

    const cookedImage = recipe.images.find(image => image.kind === 'COOKED');
    const suggestions = parseWithSchema(
      zArrayOfDishes,
      recipe.suggestionsJson as unknown as MealDishSuggestion[],
    );
    const ingredients = parseWithSchema(zArrayOfIngredients, recipe.ingredientsJson);
    const steps = parseWithSchema(zArrayOfSteps, recipe.stepsJson);
    const notes = parseWithSchema(zArrayOfNotes, recipe.notesJson ?? []);

    return parseWithSchema(mealHistoryDetailResponseSchema, {
      id: recipe.id,
      language: recipe.language,
      inputImageUrl: recipe.inputImageUrl,
      cookedImageUrl: cookedImage?.imageUrl ?? recipe.inputImageUrl,
      selectedDishName: recipe.selectedDishName,
      selectedDishReason: recipe.selectedDishReason,
      suggestions,
      recipe: {
        title: recipe.recipeTitle,
        ingredients,
        steps,
        notes,
        nutritionEstimate: parseWithSchema(zNutritionEstimateNullable, recipe.nutritionJson ?? null) ?? undefined,
      },
      rating: recipe.feedback.rating,
      note: recipe.feedback.note,
      ateAt: recipe.feedback.ateAt?.toISOString() ?? null,
      modelInfo: {
        provider: 'gemini',
        model: recipe.modelName,
      },
      createdAt: recipe.createdAt.toISOString(),
    });
  }

  private requireSelectedDish(
    suggestions: MealDishSuggestion[],
    selectedDishId: string,
  ): MealDishSuggestion {
    const selectedDish = suggestions.find(dish => dish.id === selectedDishId);
    if (!selectedDish) {
      throw new UnauthorizedException('selectedDishId is not part of the signed analysis token');
    }
    return selectedDish;
  }

  private resetSharedContext(userId: string, reason: string): void {
    this.sharedMealContextService.clear(userId);
    this.domainEvents.publish({
      type: 'meal.context.reset',
      userId,
      payload: { reason },
    });
  }
}

const zArrayOfDishes = mealSuggestDishesResponseSchema.shape.suggestions;
const mealSuggestDishesInternalRequestSchema = mealSuggestDishesRequestSchema.extend({
  imageBase64: z.string().min(1).optional(),
  imageMimeType: z.string().trim().min(3).max(120).optional(),
});
const zArrayOfIngredients = mealGenerateRecipeResponseSchema.shape.recipe.shape.ingredients;
const zArrayOfSteps = mealGenerateRecipeResponseSchema.shape.recipe.shape.steps;
const zArrayOfNotes = mealGenerateRecipeResponseSchema.shape.recipe.shape.notes;
const zNutritionEstimateNullable =
  mealGenerateRecipeResponseSchema.shape.recipe.shape.nutritionEstimate.nullable();
