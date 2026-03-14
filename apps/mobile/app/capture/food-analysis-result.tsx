import { useEffect, useState } from 'react';
import { ActivityIndicator, Image, Pressable, ScrollView, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { MealAnalyzeImageResponse } from '@nutrition/shared';
import { analyzeFood } from '../../src/services/meal-assistant-api';
import { extractApiErrorMessage } from '../../src/services/extract-api-error-message';

export default function FoodAnalysisResultScreen() {
  const { imageUri } = useLocalSearchParams<{ imageUri: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [result, setResult] = useState<MealAnalyzeImageResponse | null>(null);
  const [status, setStatus] = useState<'loading' | 'error' | 'success'>('loading');
  const [errorMessage, setErrorMessage] = useState('');
  const [retryCount, setRetryCount] = useState(0);

  // Guard: if no imageUri param, go back to camera
  useEffect(() => {
    if (!imageUri) router.back();
  }, [imageUri]);

  useEffect(() => {
    if (!imageUri) return;
    const controller = new AbortController();
    setStatus('loading');
    setResult(null);
    setErrorMessage('');

    analyzeFood(imageUri, controller.signal)
      .then(response => {
        if (controller.signal.aborted) return;
        setResult(response);
        setStatus('success');
      })
      .catch(error => {
        if (controller.signal.aborted) return;
        setStatus('error');
        setErrorMessage(extractApiErrorMessage(error));
      });

    return () => controller.abort();
  }, [imageUri, retryCount]);

  const analysis = result?.analysis;
  const nutrition = result?.estimatedNutrition;

  return (
    <View className="flex-1 bg-[#1C1C2E]" style={{ paddingTop: insets.top }}>
      <ScrollView className="flex-1" bounces={false}>
        {/* Header with back button */}
        <View className="relative">
          {imageUri ? (
            <Image source={{ uri: imageUri }} className="w-full h-60" resizeMode="cover" />
          ) : null}
          <Pressable
            onPress={() => router.back()}
            className="absolute top-3 left-3 w-9 h-9 rounded-full bg-black/50 items-center justify-center"
            accessibilityLabel="Go back"
            accessibilityRole="button"
          >
            <Ionicons name="arrow-back" size={20} color="white" />
          </Pressable>
        </View>

        {/* Content */}
        <View className="px-5 pt-4 pb-6">
          {status === 'loading' && (
            <View className="items-center justify-center py-16">
              <ActivityIndicator size="large" color="#22c55e" />
              <Text className="text-[#9CA3AF] text-sm mt-3">Analyzing your food...</Text>
            </View>
          )}

          {status === 'error' && (
            <View className="items-center justify-center py-16">
              <Text className="text-red-400 text-base text-center mb-4">
                {errorMessage || 'Something went wrong. Please try again.'}
              </Text>
              <Pressable
                onPress={() => setRetryCount(c => c + 1)}
                className="bg-[#22c55e] px-6 py-3 rounded-xl"
                accessibilityLabel="Try again"
                accessibilityRole="button"
              >
                <Text className="text-white font-semibold">Try Again</Text>
              </Pressable>
            </View>
          )}

          {status === 'success' && analysis && (
            <>
              {/* Assistant reply */}
              <Text className="text-white text-base mb-4">{analysis.assistantReply}</Text>

              {/* Nutrition bar */}
              {nutrition && <NutritionBar nutrition={nutrition} />}

              {/* Detected foods */}
              {(analysis.detected?.foods ?? []).length > 0 && (
                <View className="mt-4">
                  <Text className="text-white text-base font-bold mb-2">Detected Foods</Text>
                  {(analysis.detected?.foods ?? []).map((food, index) => (
                    <View key={index} className="flex-row justify-between py-2 border-b border-gray-700/50">
                      <Text className="text-white text-sm">{food.name}</Text>
                      {food.quantity && (
                        <Text className="text-[#9CA3AF] text-sm">{food.quantity}</Text>
                      )}
                    </View>
                  ))}
                </View>
              )}

              {/* Missing info hints */}
              {(analysis.missing ?? []).length > 0 && (
                <View className="mt-4">
                  {(analysis.missing ?? []).map((hint, index) => (
                    <Text key={index} className="text-[#9CA3AF] text-xs italic">
                      • {hint}
                    </Text>
                  ))}
                </View>
              )}
            </>
          )}
        </View>
      </ScrollView>

      {/* Retake button — fixed at bottom */}
      <View className="px-5 pb-2" style={{ paddingBottom: insets.bottom + 8 }}>
        <Pressable
          onPress={() => router.back()}
          className="w-full py-3.5 rounded-xl items-center bg-gray-700"
          accessibilityLabel="Retake photo"
          accessibilityRole="button"
        >
          <Text className="text-white font-semibold text-base">Retake Photo</Text>
        </Pressable>
      </View>
    </View>
  );
}

/** Compact horizontal nutrition summary bar */
function NutritionBar({ nutrition }: { nutrition: NonNullable<MealAnalyzeImageResponse['estimatedNutrition']> }) {
  const items = [
    { label: 'Cal', value: nutrition.calories, unit: '' },
    { label: 'Protein', value: nutrition.protein, unit: 'g' },
    { label: 'Carbs', value: nutrition.carbs, unit: 'g' },
    { label: 'Fats', value: nutrition.fats, unit: 'g' },
  ].filter(item => item.value != null);

  if (items.length === 0) return null;

  return (
    <View className="flex-row justify-between bg-[#2A2A40] rounded-xl px-4 py-3">
      {items.map((item, index) => (
        <View key={index} className="items-center">
          <Text className="text-white font-bold text-sm">
            {item.value}{item.unit}
          </Text>
          <Text className="text-[#9CA3AF] text-xs">{item.label}</Text>
        </View>
      ))}
    </View>
  );
}
