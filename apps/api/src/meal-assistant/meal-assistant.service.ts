import { Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import {
  MealDishSuggestion,
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

@Injectable()
export class MealAssistantService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly domainEvents: DomainEventsService,
    private readonly firebaseStorageUrlService: FirebaseStorageUrlService,
    private readonly geminiService: GeminiService,
    private readonly draftTokenService: MealDraftTokenService,
  ) {}

  async suggestDishes(user: AuthenticatedUser, rawInput: unknown) {
    const input = parseWithSchema(mealSuggestDishesRequestSchema, rawInput);
    const inputImageUrl = this.firebaseStorageUrlService.validateImageUrl(
      input.inputImageUrl,
      'inputImageUrl',
    );

    this.domainEvents.publish({
      type: 'meal.suggest.requested',
      userId: user.id,
      payload: {
        locale: input.locale,
      },
    });

    try {
      const suggestResult = await this.geminiService.suggestDishesFromImage({
        inputImageUrl,
        locale: input.locale,
        constraints: input.constraints,
      });

      const signed = this.draftTokenService.signAnalysisToken({
        userId: user.id,
        inputImageUrl,
        locale: input.locale,
        constraints: input.constraints,
        suggestions: suggestResult.suggestions,
        modelName: suggestResult.modelName,
      });

      this.domainEvents.publish({
        type: 'meal.suggest.completed',
        userId: user.id,
        payload: {
          analysisJti: signed.payload.jti,
          suggestionsCount: suggestResult.suggestions.length,
        },
      });

      return parseWithSchema(mealSuggestDishesResponseSchema, {
        suggestions: suggestResult.suggestions,
        analysisToken: signed.token,
        modelInfo: {
          provider: 'gemini',
          model: suggestResult.modelName,
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

  async generateRecipe(user: AuthenticatedUser, rawInput: unknown) {
    const input = parseWithSchema(mealGenerateRecipeRequestSchema, rawInput);
    const analysisPayload = this.draftTokenService.verifyAnalysisToken(input.analysisToken, user.id);
    const selectedDish = analysisPayload.data.suggestions.find(dish => dish.id === input.selectedDishId);

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
        suggestions: analysisPayload.data.suggestions,
        servings: input.servings,
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
      analysisPayload.data.suggestions,
      recipePayload.data.selectedDishId,
    );

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
          inputImageUrl: analysisPayload.data.inputImageUrl,
          recipeTitle: recipe.title,
          selectedDishName: selectedDish.name,
          selectedDishReason: selectedDish.reason,
          suggestionsJson: analysisPayload.data.suggestions as unknown as Prisma.InputJsonValue,
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
            imageUrl: analysisPayload.data.inputImageUrl,
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

    return parseWithSchema(mealSaveResponseSchema, {
      savedId: created.id,
      createdAt: created.createdAt.toISOString(),
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
}

const zArrayOfDishes = mealSuggestDishesResponseSchema.shape.suggestions;
const zArrayOfIngredients = mealGenerateRecipeResponseSchema.shape.recipe.shape.ingredients;
const zArrayOfSteps = mealGenerateRecipeResponseSchema.shape.recipe.shape.steps;
const zArrayOfNotes = mealGenerateRecipeResponseSchema.shape.recipe.shape.notes;
const zNutritionEstimateNullable =
  mealGenerateRecipeResponseSchema.shape.recipe.shape.nutritionEstimate.nullable();
