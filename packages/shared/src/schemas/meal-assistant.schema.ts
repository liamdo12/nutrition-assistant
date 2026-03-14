import { z } from 'zod';

export const mealModelInfoSchema = z.object({
  provider: z.literal('gemini'),
  model: z.string().trim().min(1).max(120),
});

export const mealNutritionEstimateSchema = z.object({
  calories: z.number().int().nonnegative().optional(),
  protein: z.number().nonnegative().optional(),
  carbs: z.number().nonnegative().optional(),
  fats: z.number().nonnegative().optional(),
});

export const mealDishSuggestionSchema = z.object({
  id: z.string().trim().min(1).max(120),
  name: z.string().trim().min(1).max(160),
  reason: z.string().trim().min(1).max(500),
  estimatedNutrition: mealNutritionEstimateSchema.optional(),
});

export const mealSuggestDishesRequestSchema = z.object({
  locale: z.string().trim().min(2).max(20).default('en'),
  constraints: z.string().trim().min(1).max(1000).optional(),
  inputImageUrl: z.string().url().max(2048).optional(),
});

export const mealSuggestDishesResponseSchema = z.object({
  suggestions: z.array(mealDishSuggestionSchema).length(5),
  analysisToken: z.string().min(20),
  modelInfo: mealModelInfoSchema,
  expiresAt: z.string().datetime(),
});

export const mealRecipeIngredientSchema = z.object({
  name: z.string().trim().min(1).max(160),
  quantity: z.string().trim().min(1).max(160).optional(),
});

export const mealGeneratedRecipeSchema = z.object({
  title: z.string().trim().min(1).max(200),
  ingredients: z.array(mealRecipeIngredientSchema).min(1).max(50),
  steps: z.array(z.string().trim().min(1).max(1000)).min(1).max(30),
  notes: z.array(z.string().trim().min(1).max(1000)).max(20).default([]),
  nutritionEstimate: mealNutritionEstimateSchema.optional(),
});

export const mealGenerateRecipeRequestSchema = z.object({
  analysisToken: z.string().min(20),
  selectedDishId: z.string().trim().min(1).max(120),
  servings: z.number().int().min(1).max(20).optional(),
  preferences: z.string().trim().min(1).max(1000).optional(),
});

export const mealGenerateRecipeResponseSchema = z.object({
  recipe: mealGeneratedRecipeSchema,
  recipeToken: z.string().min(20),
  modelInfo: mealModelInfoSchema,
  expiresAt: z.string().datetime(),
});

export const mealDetectedFoodItemSchema = z.object({
  name: z.string().trim().min(1).max(160),
  quantity: z.string().trim().min(1).max(120).optional(),
});

export const mealTextAnalysisSchema = z.object({
  detected: z.object({
    foods: z.array(mealDetectedFoodItemSchema).max(30).default([]),
    nutritionGoals: z.array(z.string().trim().min(1).max(200)).max(20).default([]),
    dietaryConstraints: z.array(z.string().trim().min(1).max(200)).max(20).default([]),
    mealTime: z.string().trim().min(1).max(80).optional(),
  }),
  missing: z.array(z.string().trim().min(1).max(300)).max(20).default([]),
  assistantReply: z.string().trim().min(1).max(2000),
});

export const mealAnalyzeTextRequestSchema = z.object({
  text: z.string().trim().min(1).max(4000),
  locale: z.string().trim().min(2).max(20).default('en'),
  constraints: z.string().trim().min(1).max(1000).optional(),
});

export const mealAnalyzeTextResponseSchema = z.object({
  analysis: mealTextAnalysisSchema,
  modelInfo: mealModelInfoSchema,
});

/** Response schema for image-based food analysis (replaces suggest-dishes for photo capture) */
export const mealAnalyzeImageResponseSchema = z.object({
  analysis: mealTextAnalysisSchema,
  estimatedNutrition: mealNutritionEstimateSchema.optional(),
  analysisToken: z.string().min(20),
  modelInfo: mealModelInfoSchema,
  expiresAt: z.string().datetime(),
});

export const mealContextResetResponseSchema = z.object({
  reset: z.literal(true),
  resetAt: z.string().datetime(),
});

export const mealSaveRequestSchema = z.object({
  analysisToken: z.string().min(20),
  recipeToken: z.string().min(20),
  cookedImageUrl: z.string().url().max(2048),
  rating: z.number().int().min(1).max(5),
  note: z.string().trim().min(1).max(1000).optional(),
  ateAt: z.string().datetime().optional(),
});

export const mealSaveResponseSchema = z.object({
  savedId: z.string().uuid(),
  createdAt: z.string().datetime(),
});

export const mealHistoryQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(10),
});

export const mealHistoryItemSchema = z.object({
  id: z.string().uuid(),
  selectedDishName: z.string().trim().min(1),
  rating: z.number().int().min(1).max(5),
  inputImageUrl: z.string().url(),
  cookedImageUrl: z.string().url(),
  createdAt: z.string().datetime(),
});

export const mealHistoryResponseSchema = z.object({
  items: z.array(mealHistoryItemSchema),
  page: z.number().int().min(1),
  pageSize: z.number().int().min(1),
  total: z.number().int().nonnegative(),
});

export const mealHistoryDetailResponseSchema = z.object({
  id: z.string().uuid(),
  language: z.string().trim().min(2).max(20),
  inputImageUrl: z.string().url(),
  cookedImageUrl: z.string().url(),
  selectedDishName: z.string().trim().min(1),
  selectedDishReason: z.string().trim().min(1),
  suggestions: z.array(mealDishSuggestionSchema).max(10),
  recipe: mealGeneratedRecipeSchema,
  rating: z.number().int().min(1).max(5),
  note: z.string().trim().min(1).max(1000).nullable(),
  ateAt: z.string().datetime().nullable(),
  modelInfo: mealModelInfoSchema,
  createdAt: z.string().datetime(),
});

export const mealLiveClientAudioChunkSchema = z.object({
  chunkBase64: z.string().min(1),
  mimeType: z.string().trim().min(3).max(120),
});

export const mealLiveClientTextInputSchema = z.object({
  text: z.string().trim().min(1).max(2000),
});

export const mealLiveClientContextSyncSchema = z.object({
  analysisToken: z.string().min(20),
  selectedDishId: z.string().trim().min(1).max(120).optional(),
  preferences: z.string().trim().min(1).max(1000).optional(),
});

export const mealLiveServerTranscriptPartialSchema = z.object({
  text: z.string(),
});

export const mealLiveServerTranscriptFinalSchema = z.object({
  text: z.string(),
});

export const mealLiveServerModelTextSchema = z.object({
  text: z.string(),
});

export const mealLiveServerModelAudioChunkSchema = z.object({
  chunkBase64: z.string().min(1),
  mimeType: z.string().trim().min(3).max(120),
});

export const mealLiveServerErrorSchema = z.object({
  code: z.string().trim().min(1).max(120),
  message: z.string().trim().min(1).max(1000),
});

export const mealLiveServerSessionClosedSchema = z.object({
  reason: z.string().trim().min(1).max(500),
});

export const mealLiveServerContextSyncedSchema = z.object({
  analysisJti: z.string().uuid(),
  selectedDishId: z.string().trim().min(1).max(120).nullable(),
  suggestionsCount: z.number().int().nonnegative().max(20),
});

export type MealDishSuggestion = z.infer<typeof mealDishSuggestionSchema>;
export type MealGeneratedRecipe = z.infer<typeof mealGeneratedRecipeSchema>;
export type MealSuggestDishesRequest = z.infer<typeof mealSuggestDishesRequestSchema>;
export type MealSuggestDishesResponse = z.infer<typeof mealSuggestDishesResponseSchema>;
export type MealGenerateRecipeRequest = z.infer<typeof mealGenerateRecipeRequestSchema>;
export type MealGenerateRecipeResponse = z.infer<typeof mealGenerateRecipeResponseSchema>;
export type MealTextAnalysis = z.infer<typeof mealTextAnalysisSchema>;
export type MealAnalyzeTextRequest = z.infer<typeof mealAnalyzeTextRequestSchema>;
export type MealAnalyzeTextResponse = z.infer<typeof mealAnalyzeTextResponseSchema>;
export type MealAnalyzeImageResponse = z.infer<typeof mealAnalyzeImageResponseSchema>;
export type MealContextResetResponse = z.infer<typeof mealContextResetResponseSchema>;
export type MealSaveRequest = z.infer<typeof mealSaveRequestSchema>;
export type MealSaveResponse = z.infer<typeof mealSaveResponseSchema>;
export type MealHistoryQuery = z.infer<typeof mealHistoryQuerySchema>;
export type MealHistoryResponse = z.infer<typeof mealHistoryResponseSchema>;
export type MealHistoryDetailResponse = z.infer<typeof mealHistoryDetailResponseSchema>;
export type MealLiveClientContextSync = z.infer<typeof mealLiveClientContextSyncSchema>;
export type MealLiveServerContextSynced = z.infer<typeof mealLiveServerContextSyncedSchema>;
