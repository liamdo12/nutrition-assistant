import { Injectable } from '@nestjs/common';
import { MealDishSuggestion, MealTextAnalysis } from '@nutrition/shared';

interface SharedMealContextState {
  locale?: string;
  constraints?: string;
  preferences?: string;
  selectedDishId?: string | null;
  selectedDishName?: string | null;
  suggestions: MealDishSuggestion[];
  /** Detected food items from image analysis */
  detectedFoods: string[];
  nutritionGoals: string[];
  dietaryConstraints: string[];
  recentUserTexts: string[];
  recentModelTexts: string[];
  lastUpdatedAt: number;
}

@Injectable()
export class SharedMealContextService {
  private readonly states = new Map<string, SharedMealContextState>();
  private readonly versions = new Map<string, number>();

  mergeImageAnalysis(
    userId: string,
    input: {
      locale: string;
      constraints?: string;
      analysis: MealTextAnalysis;
      suggestions?: MealDishSuggestion[];
    },
  ): void {
    const state = this.getOrCreateState(userId);
    state.locale = input.locale;
    state.constraints = input.constraints ?? state.constraints;

    // Merge from analysis (new flow)
    const foodNames = input.analysis.detected.foods.map(f => f.name);
    this.addUnique(state.detectedFoods, foodNames, 30);
    this.addUnique(state.nutritionGoals, input.analysis.detected.nutritionGoals, 20);
    this.addUnique(state.dietaryConstraints, input.analysis.detected.dietaryConstraints, 20);

    // Backward compat: merge suggestions if provided
    if (input.suggestions) {
      state.suggestions = input.suggestions.slice(0, 5);
    }

    if (input.constraints) {
      this.addUnique(state.dietaryConstraints, [input.constraints], 20);
    }
    state.lastUpdatedAt = Date.now();
  }

  mergeMealSelection(
    userId: string,
    input: {
      selectedDishId?: string | null;
      selectedDishName?: string | null;
      preferences?: string;
    },
  ): void {
    const state = this.getOrCreateState(userId);
    state.selectedDishId = input.selectedDishId ?? state.selectedDishId ?? null;
    state.selectedDishName = input.selectedDishName ?? state.selectedDishName ?? null;
    state.preferences = input.preferences ?? state.preferences;
    state.lastUpdatedAt = Date.now();
  }

  mergeTextAnalysis(
    userId: string,
    input: {
      locale: string;
      constraints?: string;
      analysis: MealTextAnalysis;
    },
  ): void {
    const state = this.getOrCreateState(userId);
    state.locale = input.locale;
    state.constraints = input.constraints ?? state.constraints;
    this.addUnique(state.nutritionGoals, input.analysis.detected.nutritionGoals, 20);
    this.addUnique(state.dietaryConstraints, input.analysis.detected.dietaryConstraints, 20);
    state.lastUpdatedAt = Date.now();
  }

  mergeTextTurn(userId: string, role: 'user' | 'model', text: string): void {
    const normalized = text.trim().replace(/\s+/g, ' ');
    if (!normalized) {
      return;
    }

    const state = this.getOrCreateState(userId);
    if (role === 'user') {
      this.pushRecent(state.recentUserTexts, normalized, 8);
      this.inferGoalsAndConstraintsFromText(state, normalized);
    } else {
      this.pushRecent(state.recentModelTexts, normalized, 8);
    }
    state.lastUpdatedAt = Date.now();
  }

  buildPromptContext(userId: string): string {
    const state = this.states.get(userId);
    if (!state) {
      return '';
    }

    const lines: string[] = ['Shared food-nutrition context (latest):'];
    if (state.locale) {
      lines.push(`- Locale: ${state.locale}`);
    }
    if (state.constraints) {
      lines.push(`- Constraints: ${state.constraints}`);
    }
    if (state.preferences) {
      lines.push(`- Preferences: ${state.preferences}`);
    }
    if (state.nutritionGoals.length > 0) {
      lines.push(`- Nutrition goals: ${state.nutritionGoals.join('; ')}`);
    }
    if (state.dietaryConstraints.length > 0) {
      lines.push(`- Dietary constraints: ${state.dietaryConstraints.join('; ')}`);
    }
    if (state.detectedFoods.length > 0) {
      lines.push(`- Detected foods: ${state.detectedFoods.slice(0, 10).join(', ')}`);
    }
    if (state.selectedDishName) {
      lines.push(`- Selected dish: ${state.selectedDishName}`);
    }
    if (state.suggestions.length > 0) {
      lines.push(
        `- Latest suggestions: ${state.suggestions
          .slice(0, 5)
          .map(item => item.name)
          .join(', ')}`,
      );
    }
    if (state.recentUserTexts.length > 0) {
      lines.push(`- Recent user turns: ${state.recentUserTexts.slice(-3).join(' | ')}`);
    }

    return lines.length > 1 ? lines.join('\n') : '';
  }

  clear(userId: string): boolean {
    const nextVersion = (this.versions.get(userId) ?? 0) + 1;
    this.versions.set(userId, nextVersion);
    return this.states.delete(userId);
  }

  getVersion(userId: string): number {
    return this.versions.get(userId) ?? 0;
  }

  private getOrCreateState(userId: string): SharedMealContextState {
    const existing = this.states.get(userId);
    if (existing) {
      return existing;
    }

    const initial: SharedMealContextState = {
      suggestions: [],
      detectedFoods: [],
      nutritionGoals: [],
      dietaryConstraints: [],
      recentUserTexts: [],
      recentModelTexts: [],
      lastUpdatedAt: Date.now(),
    };
    this.states.set(userId, initial);
    return initial;
  }

  private pushRecent(target: string[], value: string, limit: number): void {
    target.push(value);
    if (target.length > limit) {
      target.splice(0, target.length - limit);
    }
  }

  private addUnique(target: string[], values: string[], limit: number): void {
    const seen = new Set(target.map(item => item.toLowerCase()));
    for (const value of values) {
      const normalized = value.trim();
      if (!normalized) {
        continue;
      }
      const key = normalized.toLowerCase();
      if (seen.has(key)) {
        continue;
      }
      target.push(normalized);
      seen.add(key);
      if (target.length >= limit) {
        break;
      }
    }
  }

  private inferGoalsAndConstraintsFromText(state: SharedMealContextState, text: string): void {
    const lower = text.toLowerCase();
    const goalKeywords = [
      'high protein',
      'low carb',
      'low fat',
      'weight loss',
      'muscle gain',
      'calorie deficit',
      'maintenance',
    ];
    const constraintKeywords = [
      'vegetarian',
      'vegan',
      'keto',
      'gluten-free',
      'dairy-free',
      'nut-free',
      'low sodium',
      'no sugar',
      'no pork',
    ];

    const goals = goalKeywords.filter(keyword => lower.includes(keyword));
    const constraints = constraintKeywords.filter(keyword => lower.includes(keyword));

    this.addUnique(state.nutritionGoals, goals, 20);
    this.addUnique(state.dietaryConstraints, constraints, 20);
  }
}
