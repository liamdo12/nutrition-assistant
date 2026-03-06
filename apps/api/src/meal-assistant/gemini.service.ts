import {
  BadGatewayException,
  BadRequestException,
  Injectable,
  RequestTimeoutException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  MealDishSuggestion,
  MealGeneratedRecipe,
  mealDishSuggestionSchema,
  mealGeneratedRecipeSchema,
} from '@nutrition/shared';
import { z } from 'zod';
import { AppConfig } from '../config/app.config';

interface SuggestDishesInput {
  readonly inputImageUrl: string;
  readonly locale: string;
  readonly constraints?: string;
}

interface GenerateRecipeInput {
  readonly locale: string;
  readonly selectedDish: MealDishSuggestion;
  readonly suggestions: MealDishSuggestion[];
  readonly servings?: number;
  readonly preferences?: string;
}

interface OpenLiveAudioSessionInput {
  readonly locale: string;
  readonly userId: string;
}

interface LiveSessionCallbacks {
  readonly onTranscriptPartial: (text: string) => void;
  readonly onTranscriptFinal: (text: string) => void;
  readonly onModelText: (text: string) => void;
  readonly onModelAudioChunk: (chunkBase64: string, mimeType: string) => void;
  readonly onError: (code: string, message: string) => void;
  readonly onClosed: (reason: string) => void;
}

export interface GeminiLiveSession {
  sendTextInput(text: string): Promise<void>;
  sendAudioChunk(chunkBase64: string, mimeType: string): Promise<void>;
  endTurn(): Promise<void>;
  close(reason?: string): Promise<void>;
}

const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

const suggestOutputSchema = z.object({
  suggestions: z.array(mealDishSuggestionSchema).min(1).max(10),
});

const recipeOutputSchema = z.object({
  recipe: mealGeneratedRecipeSchema,
});

@Injectable()
export class GeminiService {
  constructor(private readonly configService: ConfigService<AppConfig, true>) {}

  async suggestDishesFromImage(
    input: SuggestDishesInput,
  ): Promise<{ suggestions: MealDishSuggestion[]; modelName: string }> {
    const modelName = this.configService.get('GEMINI_TEXT_MODEL', { infer: true });

    if (!this.hasApiKey()) {
      return {
        suggestions: this.buildFallbackSuggestions(input.constraints),
        modelName,
      };
    }

    const image = await this.fetchImageInlineData(input.inputImageUrl);
    const prompt =
      `You are a cooking assistant. Detect ingredients from the image and suggest possible dishes.\n` +
      `Return strict JSON only with this shape: {"suggestions":[{"id":"dish_1","name":"...","reason":"...","estimatedNutrition":{"calories":123,"protein":12,"carbs":20,"fats":5}}]}.\n` +
      `Use English output language. Return between 5 and 8 options.\n` +
      `Locale hint: ${input.locale}\n` +
      `User constraints: ${input.constraints ?? 'none'}`;

    const parsed = await this.callGeminiJson({
      modelName,
      prompt,
      outputSchema: suggestOutputSchema,
      image,
    });

    return {
      suggestions: this.normalizeSuggestions(parsed.suggestions),
      modelName,
    };
  }

  async generateRecipe(input: GenerateRecipeInput): Promise<{ recipe: MealGeneratedRecipe; modelName: string }> {
    const modelName = this.configService.get('GEMINI_TEXT_MODEL', { infer: true });

    if (!this.hasApiKey()) {
      return {
        recipe: this.buildFallbackRecipe(input.selectedDish.name),
        modelName,
      };
    }

    const prompt =
      `You are a cooking assistant. Generate one practical recipe in English.\n` +
      `Selected dish: ${input.selectedDish.name}\n` +
      `Reason selected: ${input.selectedDish.reason}\n` +
      `All suggestions context: ${JSON.stringify(input.suggestions)}\n` +
      `Servings: ${input.servings ?? 2}\n` +
      `Preferences: ${input.preferences ?? 'none'}\n` +
      `Return strict JSON only with shape: {"recipe":{"title":"...","ingredients":[{"name":"...","quantity":"..."}],"steps":["..."],"notes":["..."],"nutritionEstimate":{"calories":123,"protein":12,"carbs":20,"fats":5}}}`;

    const parsed = await this.callGeminiJson({
      modelName,
      prompt,
      outputSchema: recipeOutputSchema,
    });

    return {
      recipe: {
        ...parsed.recipe,
        notes: parsed.recipe.notes ?? [],
      },
      modelName,
    };
  }

  async generateLiveTextReply(text: string, locale: string): Promise<string> {
    if (!this.hasApiKey()) {
      return `I heard: "${text}". I can help refine your meal plan and recipe.`;
    }

    const modelName = this.configService.get('GEMINI_TEXT_MODEL', { infer: true });
    const prompt =
      `You are a realtime cooking voice assistant. Reply in concise English.\n` +
      `Locale: ${locale}\n` +
      `User text: ${text}`;

    const parsed = await this.callGeminiJson({
      modelName,
      prompt,
      outputSchema: z.object({
        response: z.string().min(1).max(2000),
      }),
    });

    return parsed.response;
  }

  openLiveAudioSession(
    input: OpenLiveAudioSessionInput,
    callbacks: LiveSessionCallbacks,
  ): GeminiLiveSession {
    let closed = false;

    const ensureOpen = (): boolean => {
      if (closed) {
        callbacks.onError('SESSION_CLOSED', 'Session is already closed');
        return false;
      }
      return true;
    };

    return {
      sendTextInput: async (text: string) => {
        if (!ensureOpen()) {
          return;
        }

        try {
          const response = await this.generateLiveTextReply(text, input.locale);
          callbacks.onModelText(response);
        } catch (error) {
          callbacks.onError('AI_UPSTREAM_ERROR', this.toSafeErrorMessage(error));
        }
      },
      sendAudioChunk: async (chunkBase64: string, mimeType: string) => {
        if (!ensureOpen()) {
          return;
        }

        if (!chunkBase64 || !mimeType) {
          callbacks.onError('INVALID_AUDIO_CHUNK', 'Invalid realtime audio payload');
          return;
        }

        // Placeholder transcript path for phase-1 proxy contract.
        callbacks.onTranscriptPartial('Audio chunk received...');
      },
      endTurn: async () => {
        if (!ensureOpen()) {
          return;
        }

        callbacks.onTranscriptFinal('Audio turn completed.');
      },
      close: async (reason?: string) => {
        if (!closed) {
          closed = true;
          callbacks.onClosed(reason ?? 'client_disconnected');
        }
      },
    };
  }

  private hasApiKey(): boolean {
    return Boolean(this.configService.get('GEMINI_API_KEY', { infer: true }));
  }

  private async fetchImageInlineData(
    imageUrl: string,
  ): Promise<{
    inlineData: {
      mimeType: string;
      data: string;
    };
  }> {
    const timeoutMs = this.configService.get('GEMINI_TIMEOUT_MS', { infer: true });
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(imageUrl, {
        method: 'GET',
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new BadRequestException('Unable to fetch input image URL');
      }

      const mimeType = response.headers.get('content-type')?.split(';')[0]?.trim() ?? '';
      if (!mimeType.startsWith('image/')) {
        throw new BadRequestException('Input URL must point to an image');
      }

      const data = Buffer.from(await response.arrayBuffer());
      if (data.length === 0 || data.length > MAX_IMAGE_BYTES) {
        throw new BadRequestException('Image size must be between 1 byte and 8MB');
      }

      return {
        inlineData: {
          mimeType,
          data: data.toString('base64'),
        },
      };
    } catch (error) {
      if (error instanceof BadRequestException) {
        throw error;
      }

      if ((error as Error).name === 'AbortError') {
        throw new RequestTimeoutException('Timed out while fetching input image');
      }

      throw new BadGatewayException('Failed to fetch image from provided URL');
    } finally {
      clearTimeout(timeout);
    }
  }

  private async callGeminiJson<T>(input: {
    modelName: string;
    prompt: string;
    outputSchema: z.ZodType<T>;
    image?: {
      inlineData: {
        mimeType: string;
        data: string;
      };
    };
  }): Promise<T> {
    const apiKey = this.configService.get('GEMINI_API_KEY', { infer: true });
    if (!apiKey) {
      throw new BadGatewayException('GEMINI_API_KEY is missing');
    }

    const timeoutMs = this.configService.get('GEMINI_TIMEOUT_MS', { infer: true });
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    const endpoint =
      `https://generativelanguage.googleapis.com/v1beta/models/` +
      `${encodeURIComponent(input.modelName)}:generateContent?key=${encodeURIComponent(apiKey)}`;

    const parts: Array<Record<string, unknown>> = [{ text: input.prompt }];
    if (input.image) {
      parts.push({
        inlineData: input.image.inlineData,
      });
    }

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        signal: controller.signal,
        body: JSON.stringify({
          contents: [
            {
              role: 'user',
              parts,
            },
          ],
          generationConfig: {
            temperature: 0.2,
            responseMimeType: 'application/json',
          },
        }),
      });

      if (!response.ok) {
        throw new BadGatewayException(`Gemini request failed with status ${response.status}`);
      }

      const payload = (await response.json()) as {
        candidates?: Array<{
          content?: {
            parts?: Array<{
              text?: string;
            }>;
          };
        }>;
      };

      const text = payload.candidates?.[0]?.content?.parts?.map(part => part.text ?? '').join('') ?? '';
      if (!text.trim()) {
        throw new BadGatewayException('Gemini returned an empty response');
      }

      const rawJson = this.extractJson(text);
      const parsedJson = JSON.parse(rawJson);
      const parsed = input.outputSchema.safeParse(parsedJson);

      if (!parsed.success) {
        throw new BadGatewayException('Gemini returned invalid structured output');
      }

      return parsed.data;
    } catch (error) {
      if (error instanceof BadGatewayException) {
        throw error;
      }

      if ((error as Error).name === 'AbortError') {
        throw new RequestTimeoutException('Gemini request timed out');
      }

      throw new BadGatewayException('Gemini upstream request failed');
    } finally {
      clearTimeout(timeout);
    }
  }

  private extractJson(raw: string): string {
    const trimmed = raw.trim();
    if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
      return trimmed;
    }

    const fenceMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
    if (fenceMatch?.[1]) {
      return fenceMatch[1].trim();
    }

    const start = trimmed.indexOf('{');
    const end = trimmed.lastIndexOf('}');
    if (start >= 0 && end > start) {
      return trimmed.slice(start, end + 1);
    }

    throw new BadGatewayException('Gemini output does not contain valid JSON');
  }

  private normalizeSuggestions(suggestions: MealDishSuggestion[]): MealDishSuggestion[] {
    const deduped: MealDishSuggestion[] = [];
    const seen = new Set<string>();

    for (const suggestion of suggestions) {
      const key = suggestion.name.toLowerCase();
      if (!seen.has(key)) {
        seen.add(key);
        deduped.push(suggestion);
      }
      if (deduped.length === 5) {
        break;
      }
    }

    const fallback = this.buildFallbackSuggestions();
    let index = 0;
    while (deduped.length < 5) {
      deduped.push(fallback[index]);
      index += 1;
    }

    return deduped.slice(0, 5);
  }

  private buildFallbackSuggestions(constraints?: string): MealDishSuggestion[] {
    const suffix = constraints ? ` (${constraints})` : '';
    return [
      { id: 'dish_1', name: 'Vegetable Fried Rice', reason: `Balanced and fast${suffix}` },
      { id: 'dish_2', name: 'Chicken Stir Fry', reason: `High protein one-pan meal${suffix}` },
      { id: 'dish_3', name: 'Tomato Egg Soup', reason: `Light comfort dish${suffix}` },
      { id: 'dish_4', name: 'Garlic Noodles', reason: `Simple pantry-based recipe${suffix}` },
      { id: 'dish_5', name: 'Mixed Salad Bowl', reason: `Fresh low-calorie option${suffix}` },
    ];
  }

  private buildFallbackRecipe(dishName: string): MealGeneratedRecipe {
    return {
      title: `${dishName} (Quick Version)`,
      ingredients: [
        { name: dishName, quantity: '1 serving base ingredients' },
        { name: 'Salt', quantity: 'to taste' },
        { name: 'Pepper', quantity: 'to taste' },
      ],
      steps: [
        'Prepare all ingredients and cut into bite-size pieces.',
        'Heat a pan with a little oil and cook ingredients over medium heat.',
        'Season gradually and cook until done.',
        'Plate and serve warm.',
      ],
      notes: ['Adjust seasoning and texture based on preference.'],
      nutritionEstimate: {
        calories: 450,
        protein: 25,
        carbs: 42,
        fats: 18,
      },
    };
  }

  private toSafeErrorMessage(error: unknown): string {
    if (error instanceof Error) {
      return error.message;
    }
    return 'Unknown error';
  }
}
