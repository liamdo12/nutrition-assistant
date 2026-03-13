import { Pressable, Text, View } from 'react-native';
import { MealDishSuggestion } from '@nutrition/shared';

interface DishSuggestionCardProps {
  dish: MealDishSuggestion;
  onSelect: (dish: MealDishSuggestion) => void;
}

/** Tappable card showing a single dish suggestion with name, reason, and optional nutrition */
export function DishSuggestionCard({ dish, onSelect }: DishSuggestionCardProps) {
  const nutrition = dish.estimatedNutrition;

  return (
    <Pressable
      onPress={() => onSelect(dish)}
      className="bg-[#2A2A40] rounded-xl p-4 mb-2 active:opacity-80"
      accessibilityRole="button"
      accessibilityLabel={`Select ${dish.name}`}
    >
      <Text className="text-white font-bold text-base" numberOfLines={2}>
        {dish.name}
      </Text>
      <Text className="text-[#9CA3AF] text-sm mt-1" numberOfLines={2}>
        {dish.reason}
      </Text>

      {nutrition && (
        <View className="flex-row mt-2 gap-3">
          {nutrition.calories != null && (
            <Text className="text-[#9CA3AF] text-xs">{nutrition.calories} cal</Text>
          )}
          {nutrition.protein != null && (
            <Text className="text-[#9CA3AF] text-xs">{nutrition.protein}g protein</Text>
          )}
          {nutrition.carbs != null && (
            <Text className="text-[#9CA3AF] text-xs">{nutrition.carbs}g carbs</Text>
          )}
          {nutrition.fats != null && (
            <Text className="text-[#9CA3AF] text-xs">{nutrition.fats}g fats</Text>
          )}
        </View>
      )}
    </Pressable>
  );
}
