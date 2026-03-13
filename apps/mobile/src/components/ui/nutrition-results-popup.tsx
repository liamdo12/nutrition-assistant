import { ActivityIndicator, Image, Modal, Pressable, ScrollView, Text, View } from 'react-native';
import { MealDishSuggestion } from '@nutrition/shared';
import { DishSuggestionCard } from './dish-suggestion-card';

export interface DishSuggestionsPopupProps {
  visible: boolean;
  imageUri: string;
  status: 'loading' | 'error' | 'success';
  suggestions: MealDishSuggestion[];
  analysisToken: string | null;
  errorMessage?: string;
  onRetake: () => void;
  onClose: () => void;
  onSelectDish: (dish: MealDishSuggestion) => void;
  onRetry: () => void;
}

/** Bottom-sheet popup showing dish suggestions from photo analysis */
export function DishSuggestionsPopup({
  visible,
  imageUri,
  status,
  suggestions,
  errorMessage,
  onRetake,
  onClose,
  onSelectDish,
  onRetry,
}: DishSuggestionsPopupProps) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onRetake}>
      {/* Dark backdrop */}
      <Pressable className="flex-1 bg-black/60" onPress={onRetake} />

      {/* Bottom card */}
      <View className="bg-[#1C1C2E] rounded-t-3xl overflow-hidden">
        {/* Food image preview */}
        {imageUri ? (
          <Image source={{ uri: imageUri }} className="w-full h-40" resizeMode="cover" />
        ) : null}

        {/* Content area — state-dependent */}
        <View className="px-5 pt-4 pb-2 min-h-[200px]">
          {status === 'loading' && (
            <View className="flex-1 items-center justify-center py-8">
              <ActivityIndicator size="large" color="#22c55e" />
              <Text className="text-[#9CA3AF] text-sm mt-3">Analyzing your ingredients...</Text>
            </View>
          )}

          {status === 'error' && (
            <View className="flex-1 items-center justify-center py-8">
              <Text className="text-red-400 text-base text-center mb-4">
                {errorMessage || 'Something went wrong. Please try again.'}
              </Text>
              <Pressable
                onPress={onRetry}
                className="bg-[#22c55e] px-6 py-3 rounded-xl"
                accessibilityLabel="Try again"
                accessibilityRole="button"
              >
                <Text className="text-white font-semibold">Try Again</Text>
              </Pressable>
            </View>
          )}

          {status === 'success' && (
            <>
              <Text className="text-white text-lg font-bold mb-3">Dish Suggestions</Text>
              <View className="h-px bg-gray-700 mb-3" />
              <ScrollView className="max-h-[280px]" nestedScrollEnabled>
                {suggestions.map(dish => (
                  <DishSuggestionCard key={dish.id} dish={dish} onSelect={onSelectDish} />
                ))}
              </ScrollView>
            </>
          )}
        </View>

        {/* Bottom buttons */}
        <View className="flex-row px-5 pb-8 gap-3">
          <Pressable
            onPress={onRetake}
            className="flex-1 py-3 rounded-xl items-center bg-gray-700"
            accessibilityLabel="Retake photo"
            accessibilityRole="button"
          >
            <Text className="text-white font-semibold">Retake</Text>
          </Pressable>
          {status === 'success' && (
            <Pressable
              onPress={onClose}
              className="flex-1 py-3 rounded-xl items-center bg-[#22c55e]"
              accessibilityLabel="Close suggestions"
              accessibilityRole="button"
            >
              <Text className="text-white font-semibold">Close</Text>
            </Pressable>
          )}
        </View>
      </View>
    </Modal>
  );
}
