import {
  BadGatewayException,
  BadRequestException,
  Injectable,
  RequestTimeoutException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GoogleGenAI, Modality, type LiveServerMessage, type Session } from '@google/genai';
import {
  MealDishSuggestion,
  MealGeneratedRecipe,
  MealTextAnalysis,
  mealDishSuggestionSchema,
  mealGeneratedRecipeSchema,
  mealTextAnalysisSchema,
} from '@nutrition/shared';
import { z } from 'zod';
import { AppConfig } from '../config/app.config';

interface SuggestDishesInput {
  readonly imageBase64?: string;
  readonly imageMimeType?: string;
  readonly inputImageUrl?: string;
  readonly locale: string;
  readonly constraints?: string;
  readonly sharedContext?: string;
}

interface GenerateRecipeInput {
  readonly locale: string;
  readonly selectedDish: MealDishSuggestion;
  readonly suggestions: MealDishSuggestion[];
  readonly servings?: number;
  readonly preferences?: string;
  readonly sharedContext?: string;
}

interface OpenLiveAudioSessionInput {
  readonly locale: string;
  readonly userId: string;
  readonly sharedContext?: string;
}

interface AnalyzeFoodTextInput {
  readonly text: string;
  readonly locale: string;
  readonly constraints?: string;
  readonly sharedContext?: string;
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

const textAnalysisOutputSchema = z.object({
  analysis: mealTextAnalysisSchema,
});

@Injectable()
export class GeminiService {
  constructor(private readonly configService: ConfigService<AppConfig, true>) {}

  async suggestDishesFromImage(
    input: SuggestDishesInput,
  ): Promise<{ suggestions: MealDishSuggestion[]; modelName: string }> {
    const modelName = this.configService.get('GEMINI_LIVE_MODEL', { infer: true });

    if (!this.hasApiKey()) {
      return {
        suggestions: this.buildFallbackSuggestions(input.constraints),
        modelName,
      };
    }

    const image = await this.resolveInlineImage(input);
    const prompt =
      `You are a cooking assistant. Detect ingredients from the image and suggest possible dishes.\n` +
      `Return strict JSON only with this shape: {"suggestions":[{"id":"dish_1","name":"...","reason":"...","estimatedNutrition":{"calories":123,"protein":12,"carbs":20,"fats":5}}]}.\n` +
      `Use English output language. Return between 5 options.\n` +
      `Locale hint: ${input.locale}\n` +
      `User constraints: ${input.constraints ?? 'none'}\n` +
      `${input.sharedContext ? `${input.sharedContext}\n` : ''}` +
      'Apply the shared context when generating suggestions.';

    const parsed = await this.callGeminiJson({
      modelName,
      prompt,
      outputSchema: suggestOutputSchema,
      image,
      fallbackFromRaw: rawText => {
        const suggestions = this.extractSuggestionsFromNarrative(rawText, input.constraints);
        if (suggestions.length === 0) {
          return null;
        }

        return { suggestions };
      },
    });

    return {
      suggestions: this.normalizeSuggestions(parsed.suggestions),
      modelName,
    };
  }

  async generateRecipe(input: GenerateRecipeInput): Promise<{ recipe: MealGeneratedRecipe; modelName: string }> {
    const modelName = this.configService.get('GEMINI_LIVE_MODEL', { infer: true });

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
      `${input.sharedContext ? `${input.sharedContext}\n` : ''}` +
      `Return strict JSON only with shape: {"recipe":{"title":"...","ingredients":[{"name":"...","quantity":"..."}],"steps":["..."],"notes":["..."],"nutritionEstimate":{"calories":123,"protein":12,"carbs":20,"fats":5}}}`;

    try {
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
    } catch (error) {
      if (this.shouldUseRecipeFallback(error)) {
        return {
          recipe: this.buildFallbackRecipe(input.selectedDish.name),
          modelName,
        };
      }
      throw error;
    }
  }

  async analyzeFoodText(
    input: AnalyzeFoodTextInput,
  ): Promise<{ analysis: MealTextAnalysis; modelName: string }> {
    const modelName = this.configService.get('GEMINI_LIVE_MODEL', { infer: true });

    if (!this.hasApiKey()) {
      return {
        analysis: this.buildFallbackTextAnalysis(input),
        modelName,
      };
    }

    const prompt =
      'You are a nutrition assistant focused on food logging.\n' +
      'Read the user meal text and return strict JSON only.\n' +
      'Extract what is already known, what is still missing for accurate nutrition analysis, and one concise follow-up reply.\n' +
      'Return shape: {"analysis":{"detected":{"foods":[{"name":"...","quantity":"..."}],"nutritionGoals":["..."],"dietaryConstraints":["..."],"mealTime":"..."},"missing":["..."],"assistantReply":"..."}}.\n' +
      'If a field is unknown, keep it empty instead of guessing.\n' +
      `Locale hint: ${input.locale}\n` +
      `Explicit constraints: ${input.constraints ?? 'none'}\n` +
      `${input.sharedContext ? `${input.sharedContext}\n` : ''}` +
      `User text: ${input.text}`;

    const parsed = await this.callGeminiJson({
      modelName,
      prompt,
      outputSchema: textAnalysisOutputSchema,
      fallbackFromRaw: rawText => ({
        analysis: this.buildFallbackTextAnalysis(input, rawText),
      }),
    });

    return {
      analysis: this.normalizeTextAnalysis(parsed.analysis, input),
      modelName,
    };
  }

  async generateLiveTextReply(text: string, locale: string): Promise<string> {
    if (!this.hasApiKey()) {
      return `I heard: "${text}". I can help refine your meal plan and recipe.`;
    }

    const modelName = this.configService.get('GEMINI_LIVE_MODEL', { infer: true });
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
    if (!this.hasApiKey()) {
      return this.openFallbackLiveAudioSession(input, callbacks);
    }

    let permanentlyClosed = false;
    let closeNotified = false;
    let liveSession: Session | null = null;
    let connectPromise: Promise<Session | null> | null = null;

    const notifyClosed = (reason: string): void => {
      if (closeNotified) {
        return;
      }
      closeNotified = true;
      callbacks.onClosed(reason);
    };

    const ensureOpen = (): boolean => {
      if (permanentlyClosed) {
        callbacks.onError('SESSION_CLOSED', 'Session is already closed');
        return false;
      }
      return true;
    };

    const ensureSession = async (): Promise<Session | null> => {
      if (liveSession) {
        return liveSession;
      }

      if (permanentlyClosed) {
        return null;
      }

      if (!connectPromise) {
        connectPromise = this.connectLiveSession(input, callbacks, reason => {
          liveSession = null;
          connectPromise = null;
          if (permanentlyClosed) {
            return;
          }
          callbacks.onError(
            'LIVE_SOCKET_CLOSED',
            `Upstream live session closed (${reason}). Reconnecting on next input.`,
          );
        })
          .then(session => {
            if (permanentlyClosed) {
              session.close();
              return null;
            }

            liveSession = session;
            return session;
          })
          .catch(error => {
            connectPromise = null;
            callbacks.onError('AI_UPSTREAM_ERROR', this.toSafeErrorMessage(error));
            return null;
          });
      }

      return connectPromise;
    };

    void ensureSession();

    return {
      sendTextInput: async (text: string) => {
        if (!ensureOpen()) {
          return;
        }

        if (!text.trim()) {
          callbacks.onError('INVALID_TEXT_INPUT', 'Text input cannot be empty');
          return;
        }

        const session = await ensureSession();
        if (!session) {
          return;
        }

        try {
          session.sendClientContent({
            turns: [
              {
                role: 'user',
                parts: [{ text }],
              },
            ],
            turnComplete: true,
          });
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

        const session = await ensureSession();
        if (!session) {
          return;
        }

        try {
          session.sendRealtimeInput({
            audio: {
              data: chunkBase64,
              mimeType,
            },
          });
        } catch (error) {
          callbacks.onError('AI_UPSTREAM_ERROR', this.toSafeErrorMessage(error));
        }
      },
      endTurn: async () => {
        if (!ensureOpen()) {
          return;
        }

        const session = await ensureSession();
        if (!session) {
          return;
        }

        try {
          session.sendRealtimeInput({
            audioStreamEnd: true,
          });
        } catch (error) {
          callbacks.onError('AI_UPSTREAM_ERROR', this.toSafeErrorMessage(error));
        }
      },
      close: async (reason?: string) => {
        if (permanentlyClosed) {
          return;
        }

        permanentlyClosed = true;
        const closeReason = reason ?? 'client_disconnected';

        try {
          liveSession?.close();
        } catch (error) {
          callbacks.onError('LIVE_SOCKET_CLOSE_ERROR', this.toSafeErrorMessage(error));
        } finally {
          notifyClosed(closeReason);
        }
      },
    };
  }

  private hasApiKey(): boolean {
    return Boolean(this.configService.get('GEMINI_API_KEY', { infer: true }));
  }

  private async connectLiveSession(
    input: OpenLiveAudioSessionInput,
    callbacks: LiveSessionCallbacks,
    onUpstreamClosed: (reason: string) => void,
  ): Promise<Session> {
    const apiKey = this.configService.get('GEMINI_API_KEY', { infer: true });
    if (!apiKey) {
      throw new BadGatewayException('GEMINI_API_KEY is missing');
    }

    const modelName = this.configService.get('GEMINI_LIVE_MODEL', { infer: true });
    const ai = new GoogleGenAI({ apiKey });

    return ai.live.connect({
      model: modelName,
      config: {
        responseModalities: [Modality.AUDIO],
        inputAudioTranscription: {},
        outputAudioTranscription: {},
        systemInstruction: this.buildLiveSystemInstruction(
          input.locale,
          input.userId,
          input.sharedContext,
        ),
      },
      callbacks: {
        onmessage: message => {
          this.handleLiveServerMessage(message, callbacks);
        },
        onerror: errorEvent => {
          const message =
            errorEvent.error instanceof Error
              ? errorEvent.error.message
              : errorEvent.message || 'Unexpected live socket error';
          callbacks.onError('LIVE_SOCKET_ERROR', message);
        },
        onclose: event => {
          onUpstreamClosed(event.reason || 'upstream_closed');
        },
      },
    });
  }

  private handleLiveServerMessage(message: LiveServerMessage, callbacks: LiveSessionCallbacks): void {
    const serverContent = message.serverContent;

    if (serverContent?.inputTranscription?.text) {
      if (serverContent.inputTranscription.finished) {
        callbacks.onTranscriptFinal(serverContent.inputTranscription.text);
      } else {
        callbacks.onTranscriptPartial(serverContent.inputTranscription.text);
      }
    }

    if (serverContent?.outputTranscription?.text && serverContent.outputTranscription.finished) {
      callbacks.onModelText(serverContent.outputTranscription.text);
    }

    const parts = serverContent?.modelTurn?.parts ?? [];
    for (const part of parts) {
      if (part.text && part.text.trim()) {
        callbacks.onModelText(part.text);
      }

      const inlineData = part.inlineData;
      if (inlineData?.data && inlineData.mimeType?.startsWith('audio/')) {
        callbacks.onModelAudioChunk(inlineData.data, inlineData.mimeType);
      }
    }

    if (message.goAway?.timeLeft) {
      callbacks.onError('LIVE_GO_AWAY', `Live session will close soon (${message.goAway.timeLeft})`);
    }
  }

  private openFallbackLiveAudioSession(
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

  private buildLiveSystemInstruction(locale: string, userId: string, sharedContext?: string): string {
    return (
      'You are a realtime cooking voice assistant. ' +
      'Give concise and practical meal guidance in English unless the user clearly asks for another language.\n' +
      `Locale hint: ${locale}\n` +
      `Session user id: ${userId}\n` +
      `${sharedContext ?? ''}`
    );
  }

  private async resolveInlineImage(input: SuggestDishesInput): Promise<{
    inlineData: {
      mimeType: string;
      data: string;
    };
  }> {
    if (input.imageBase64 && input.imageMimeType) {
      return this.buildInlineImageData(input.imageBase64, input.imageMimeType);
    }

    if (input.inputImageUrl) {
      return this.fetchImageInlineData(input.inputImageUrl);
    }

    throw new BadRequestException(
      'Suggest dishes requires either uploaded image data or inputImageUrl',
    );
  }

  private buildInlineImageData(imageBase64: string, mimeType: string): {
    inlineData: {
      mimeType: string;
      data: string;
    };
  } {
    if (!mimeType.startsWith('image/')) {
      throw new BadRequestException('Uploaded file must be an image');
    }

    const normalizedBase64 = imageBase64.trim();
    if (!normalizedBase64) {
      throw new BadRequestException('Image payload cannot be empty');
    }

    let data: Buffer;
    try {
      data = Buffer.from(normalizedBase64, 'base64');
    } catch {
      throw new BadRequestException('Invalid base64 image payload');
    }

    if (data.length === 0 || data.length > MAX_IMAGE_BYTES) {
      throw new BadRequestException('Image size must be between 1 byte and 8MB');
    }

    return {
      inlineData: {
        mimeType,
        data: data.toString('base64'),
      },
    };
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
    fallbackFromRaw?: (rawText: string) => T | null;
  }): Promise<T> {
    const apiKey = this.configService.get('GEMINI_API_KEY', { infer: true });
    if (!apiKey) {
      throw new BadGatewayException('GEMINI_API_KEY is missing');
    }

    const timeoutMs = this.configService.get('GEMINI_TIMEOUT_MS', { infer: true });
    const ai = new GoogleGenAI({ apiKey });
    const promptParts: Array<Record<string, unknown>> = [{ text: input.prompt }];
    if (input.image) {
      promptParts.push({
        inlineData: input.image.inlineData,
      });
    }

    let session: Session | null = null;
    const modelTextChunks: string[] = [];
    const outputTranscriptionChunks: string[] = [];
    let settled = false;
    let timeout: NodeJS.Timeout | null = null;

    try {
      const turnPromise = new Promise<void>(async (resolve, reject) => {
        const settleResolve = (): void => {
          if (settled) {
            return;
          }
          settled = true;
          resolve();
        };
        const settleReject = (error: Error): void => {
          if (settled) {
            return;
          }
          settled = true;
          reject(error);
        };

        timeout = setTimeout(() => {
          settleReject(new RequestTimeoutException('Gemini request timed out'));
        }, timeoutMs);

        try {
          session = await ai.live.connect({
            model: input.modelName,
            config: {
              responseModalities: [Modality.AUDIO],
              outputAudioTranscription: {},
            },
            callbacks: {
              onmessage: message => {
                const parts = message.serverContent?.modelTurn?.parts ?? [];
                for (const part of parts) {
                  if (part.text) {
                    modelTextChunks.push(part.text);
                  }
                }

                const outputTranscription = message.serverContent?.outputTranscription?.text;
                if (outputTranscription) {
                  outputTranscriptionChunks.push(outputTranscription);
                }

                if (message.serverContent?.turnComplete) {
                  settleResolve();
                }
              },
              onerror: errorEvent => {
                const message =
                  errorEvent.error instanceof Error
                    ? errorEvent.error.message
                    : errorEvent.message || 'Gemini live socket error';
                settleReject(new BadGatewayException(message));
              },
              onclose: event => {
                if (!settled) {
                  settleReject(
                    new BadGatewayException(
                      `Gemini live socket closed unexpectedly (${event.reason || 'no reason'})`,
                    ),
                  );
                }
              },
            },
          });

          session.sendClientContent({
            turns: [
              {
                role: 'user',
                parts: promptParts,
              },
            ],
            turnComplete: true,
          });
        } catch (error) {
          settleReject(
            error instanceof Error
              ? error
              : new BadGatewayException('Gemini upstream request failed'),
          );
        }
      });

      await turnPromise;

      const transcriptionText = outputTranscriptionChunks.join('').trim();
      const modelText = modelTextChunks.join('\n').trim();
      const parseCandidates = [transcriptionText, modelText].filter(Boolean);

      if (parseCandidates.length === 0) {
        throw new BadGatewayException('Gemini returned an empty response');
      }

      for (const candidate of parseCandidates) {
        const parsed = this.findValidStructuredOutput(candidate, input.outputSchema);
        if (parsed) {
          return parsed;
        }
      }

      if (input.fallbackFromRaw) {
        const fallbackCandidate = parseCandidates.join('\n\n');
        const fallback = input.fallbackFromRaw(fallbackCandidate);
        if (fallback) {
          const validatedFallback = input.outputSchema.safeParse(fallback);
          if (validatedFallback.success) {
            return validatedFallback.data;
          }
        }
      }

      throw new BadGatewayException('Gemini returned invalid structured output');
    } catch (error) {
      if (error instanceof BadGatewayException || error instanceof RequestTimeoutException) {
        throw error;
      }
      throw new BadGatewayException('Gemini upstream request failed');
    } finally {
      if (timeout) {
        clearTimeout(timeout);
      }
      try {
        (session as { close?: () => void } | null)?.close?.();
      } catch {
        // Ignore close errors at cleanup phase.
      }
    }
  }

  private findValidStructuredOutput<T>(rawText: string, outputSchema: z.ZodType<T>): T | null {
    const candidates = this.collectJsonCandidates(rawText);

    for (const candidate of candidates) {
      try {
        const parsedJson = JSON.parse(candidate);
        const parsed = outputSchema.safeParse(parsedJson);
        if (parsed.success) {
          return parsed.data;
        }
      } catch {
        // Ignore malformed candidates and continue.
      }
    }

    return null;
  }

  private collectJsonCandidates(raw: string): string[] {
    const candidates: string[] = [];
    const seen = new Set<string>();

    const addCandidate = (value: string): void => {
      const trimmed = value.trim();
      if (!trimmed || seen.has(trimmed)) {
        return;
      }
      seen.add(trimmed);
      candidates.push(trimmed);
    };

    addCandidate(raw);

    try {
      addCandidate(this.extractJson(raw));
    } catch {
      // Ignore when no direct object can be extracted.
    }

    const fenceRegex = /```(?:json)?\s*([\s\S]*?)```/gi;
    let fenceMatch: RegExpExecArray | null = fenceRegex.exec(raw);
    while (fenceMatch) {
      if (fenceMatch[1]) {
        addCandidate(fenceMatch[1]);
      }
      fenceMatch = fenceRegex.exec(raw);
    }

    for (const objectText of this.collectBalancedJsonObjects(raw)) {
      addCandidate(objectText);
    }

    return candidates;
  }

  private collectBalancedJsonObjects(raw: string): string[] {
    const objects: string[] = [];
    const starts: number[] = [];

    for (let index = 0; index < raw.length; index += 1) {
      const char = raw[index];
      if (char === '{') {
        starts.push(index);
      }
    }

    for (const start of starts) {
      let depth = 0;
      for (let end = start; end < raw.length; end += 1) {
        const char = raw[end];
        if (char === '{') {
          depth += 1;
        } else if (char === '}') {
          depth -= 1;
          if (depth === 0) {
            objects.push(raw.slice(start, end + 1));
            break;
          }
        }
      }
    }

    return objects;
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

  private extractSuggestionsFromNarrative(
    rawText: string,
    constraints?: string,
  ): MealDishSuggestion[] {
    const normalized = rawText.replace(/\r/g, '\n');
    const collected: string[] = [];
    const seen = new Set<string>();
    const listSignalRegex = /\b(suggest|dish|option|selection|final)\b/i;

    const addDishName = (value: string): void => {
      const cleaned = this.sanitizeDishName(value);
      if (!cleaned) {
        return;
      }

      const key = cleaned.toLowerCase();
      if (seen.has(key)) {
        return;
      }

      seen.add(key);
      collected.push(cleaned);
    };

    const lines = normalized
      .split('\n')
      .map(line => line.trim())
      .filter(Boolean);

    for (const line of lines) {
      if (!listSignalRegex.test(line)) {
        continue;
      }

      let segment = line.replace(/\*\*/g, '').trim();
      const colonIndex = segment.indexOf(':');
      if (colonIndex < 0) {
        continue;
      }
      segment = segment.slice(colonIndex + 1).trim();

      const commaParts = segment.split(/\s*,\s*/).map(part => part.trim());
      if (commaParts.length < 3) {
        continue;
      }

      for (const part of commaParts) {
        addDishName(part.replace(/^and\s+/i, ''));
      }
    }

    const reasonSuffix = constraints ? ` Constraint: ${constraints}.` : '';
    return collected.slice(0, 5).map((name, index) => ({
      id: `dish_${index + 1}`,
      name,
      reason: `Suggested from model ingredient analysis.${reasonSuffix}`,
    }));
  }

  private sanitizeDishName(value: string): string | null {
    let cleaned = value
      .replace(/[`"'“”]/g, '')
      .replace(/[.]+$/g, '')
      .replace(/[()]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    cleaned = cleaned.replace(/^and\s+/i, '').replace(/^(a|an|the)\s+/i, '').trim();

    if (cleaned.length < 3 || cleaned.length > 120) {
      return null;
    }

    if (!/[A-Za-z]/.test(cleaned)) {
      return null;
    }

    if (!/[A-Z]/.test(cleaned)) {
      return null;
    }

    const words = cleaned.split(' ');
    if (words.length > 8) {
      return null;
    }

    if (
      /\b(now|i('| a)?m|ive|focus|json|format|output|estimate|ingredient|protein|carb|calorie|dish suggestions|ensuring|finalizing)\b/i.test(
        cleaned,
      )
    ) {
      return null;
    }

    return cleaned;
  }

  private normalizeTextAnalysis(
    analysis: z.input<typeof mealTextAnalysisSchema>,
    input: AnalyzeFoodTextInput,
  ): MealTextAnalysis {
    const fallback = this.buildFallbackTextAnalysis(input);
    const detectedFoods = Array.isArray(analysis.detected?.foods) ? analysis.detected.foods : [];
    const nutritionGoalsInput = Array.isArray(analysis.detected?.nutritionGoals)
      ? analysis.detected.nutritionGoals
      : [];
    const dietaryConstraintsInput = Array.isArray(analysis.detected?.dietaryConstraints)
      ? analysis.detected.dietaryConstraints
      : [];
    const missingInput = Array.isArray(analysis.missing) ? analysis.missing : [];

    const normalizedFoods = this.normalizeDetectedFoods([
      ...detectedFoods,
      ...fallback.detected.foods,
    ]);
    const nutritionGoals = this.uniqueStringList(
      [...nutritionGoalsInput, ...fallback.detected.nutritionGoals],
      20,
      200,
    );
    const dietaryConstraints = this.uniqueStringList(
      [...dietaryConstraintsInput, ...fallback.detected.dietaryConstraints],
      20,
      200,
    );
    const mealTime = analysis.detected?.mealTime?.trim() || fallback.detected.mealTime;
    const missing = this.uniqueStringList(
      [...missingInput, ...fallback.missing],
      20,
      300,
    );
    const assistantReply = analysis.assistantReply.trim() || fallback.assistantReply;

    return {
      detected: {
        foods: normalizedFoods,
        nutritionGoals,
        dietaryConstraints,
        mealTime,
      },
      missing,
      assistantReply,
    };
  }

  private buildFallbackTextAnalysis(
    input: AnalyzeFoodTextInput,
    modelNarrative?: string,
  ): MealTextAnalysis {
    const foods = this.extractFoodItemsFromText(input.text);
    const keywordSource = `${input.text}\n${input.constraints ?? ''}\n${modelNarrative ?? ''}`;
    const nutritionGoals = this.collectKeywordMatches(keywordSource, [
      'high protein',
      'low carb',
      'low fat',
      'high fiber',
      'weight loss',
      'muscle gain',
      'calorie deficit',
      'maintenance',
    ]);
    const dietaryConstraints = this.collectKeywordMatches(keywordSource, [
      'vegetarian',
      'vegan',
      'keto',
      'halal',
      'gluten-free',
      'dairy-free',
      'nut-free',
      'no sugar',
      'low sodium',
      'no pork',
    ]);

    if (input.constraints) {
      dietaryConstraints.unshift(input.constraints.trim());
    }

    const normalizedFoods = this.normalizeDetectedFoods(foods);
    const mealTime = this.detectMealTime(input.text);
    const missing = this.collectMissingContext({
      sourceText: input.text,
      foods: normalizedFoods,
      mealTime,
      nutritionGoals,
      dietaryConstraints,
    });

    const detectedItemsText =
      normalizedFoods.length > 0
        ? normalizedFoods
            .slice(0, 3)
            .map(item => item.name)
            .join(', ')
        : 'your meal items';
    const missingPrompt =
      missing.length > 0
        ? ` Please share: ${missing.slice(0, 2).join('; ')}.`
        : ' I have enough context to estimate nutrition.';

    return {
      detected: {
        foods: normalizedFoods,
        nutritionGoals: this.uniqueStringList(nutritionGoals, 20, 200),
        dietaryConstraints: this.uniqueStringList(dietaryConstraints, 20, 200),
        mealTime,
      },
      missing,
      assistantReply: `I detected ${detectedItemsText}.${missingPrompt}`.trim(),
    };
  }

  private normalizeDetectedFoods(
    foods: Array<{ name: string; quantity?: string }>,
  ): Array<{ name: string; quantity?: string }> {
    const result: Array<{ name: string; quantity?: string }> = [];
    const seen = new Set<string>();

    for (const food of foods) {
      const name = this.normalizeFoodName(food.name);
      if (!name) {
        continue;
      }

      const key = name.toLowerCase();
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);

      const quantity = food.quantity?.trim();
      result.push({
        name,
        quantity: quantity ? quantity.slice(0, 120) : undefined,
      });

      if (result.length === 30) {
        break;
      }
    }

    return result;
  }

  private extractFoodItemsFromText(text: string): Array<{ name: string; quantity?: string }> {
    const result: Array<{ name: string; quantity?: string }> = [];
    const quantityRegex =
      /(\b\d+(?:\.\d+)?\s*(?:g|gram|grams|kg|ml|l|cup|cups|tbsp|tsp|oz|slice|slices|piece|pieces|egg|eggs|bowl|bowls))\s+([\p{L}][\p{L}\p{N}\s-]{1,50})/giu;

    let match = quantityRegex.exec(text);
    while (match) {
      result.push({
        quantity: match[1].trim(),
        name: match[2].trim(),
      });
      match = quantityRegex.exec(text);
    }

    const segments = text.split(/,|;|\band\b/gi).map(segment => segment.trim());
    for (const segment of segments) {
      if (!segment) {
        continue;
      }

      const maybeName = segment.replace(/\b(i ate|i had|today|meal|breakfast|lunch|dinner)\b/gi, ' ');
      const cleaned = this.normalizeFoodName(maybeName);
      if (!cleaned) {
        continue;
      }

      result.push({ name: cleaned });
      if (result.length >= 20) {
        break;
      }
    }

    return result;
  }

  private normalizeFoodName(value: string): string | null {
    const trimmed = value
      .replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '')
      .replace(/\s+/g, ' ')
      .trim();

    if (!trimmed) {
      return null;
    }

    if (trimmed.length < 2 || trimmed.length > 160) {
      return null;
    }

    const words = trimmed.split(' ').filter(Boolean);
    if (words.length > 8) {
      return null;
    }

    const blocked = ['today', 'meal', 'breakfast', 'lunch', 'dinner', 'snack'];
    if (words.length === 1 && blocked.includes(words[0].toLowerCase())) {
      return null;
    }

    return trimmed;
  }

  private detectMealTime(text: string): string | undefined {
    if (/\b(breakfast|morning|brunch|sang)\b/i.test(text)) {
      return 'breakfast';
    }
    if (/\b(lunch|afternoon|trua)\b/i.test(text)) {
      return 'lunch';
    }
    if (/\b(dinner|evening|toi)\b/i.test(text)) {
      return 'dinner';
    }
    if (/\b(snack)\b/i.test(text)) {
      return 'snack';
    }
    return undefined;
  }

  private collectMissingContext(input: {
    sourceText: string;
    foods: Array<{ name: string; quantity?: string }>;
    mealTime?: string;
    nutritionGoals: string[];
    dietaryConstraints: string[];
  }): string[] {
    const missing: string[] = [];

    if (input.foods.length === 0) {
      missing.push('Main food items');
    }

    if (!input.foods.some(food => Boolean(food.quantity))) {
      missing.push('Exact quantity/portion for each food item');
    }

    if (!/\b(boiled|fried|grilled|baked|steamed|raw|sauteed|roasted)\b/i.test(input.sourceText)) {
      missing.push('Cooking method for each main item');
    }

    if (!input.mealTime) {
      missing.push('Meal time (breakfast/lunch/dinner/snack)');
    }

    if (input.nutritionGoals.length === 0 && input.dietaryConstraints.length === 0) {
      missing.push('Nutrition goal or dietary constraints');
    }

    return this.uniqueStringList(missing, 20, 300);
  }

  private collectKeywordMatches(source: string, keywords: string[]): string[] {
    const normalizedSource = source.toLowerCase();
    return keywords.filter(keyword => normalizedSource.includes(keyword.toLowerCase()));
  }

  private uniqueStringList(values: string[], limit: number, maxLength: number): string[] {
    const result: string[] = [];
    const seen = new Set<string>();

    for (const value of values) {
      const trimmed = value.trim();
      if (!trimmed) {
        continue;
      }

      const normalized = trimmed.slice(0, maxLength);
      const key = normalized.toLowerCase();
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);
      result.push(normalized);

      if (result.length === limit) {
        break;
      }
    }

    return result;
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

  private shouldUseRecipeFallback(error: unknown): boolean {
    if (!(error instanceof BadGatewayException)) {
      return false;
    }

    const message = error.message.toLowerCase();
    return (
      message.includes('invalid structured output') ||
      message.includes('empty response') ||
      message.includes('does not contain valid json')
    );
  }

  private toSafeErrorMessage(error: unknown): string {
    if (error instanceof Error) {
      return error.message;
    }
    return 'Unknown error';
  }
}
