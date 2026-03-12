import { Image, Modal, Pressable, Text, View } from 'react-native';

interface NutritionResultsPopupProps {
  visible: boolean;
  imageUri: string;
  onRetake: () => void;
  onClose: () => void;
}

/** Mock nutrition data — will be replaced by API response later */
const MOCK_NUTRITION = {
  name: 'Kiwi Smoothie Bowl with Granola',
  calories: 450,
  protein: 20,
  dailyPercent: 54,
  carbs: 140,
  fat: 13,
};

const METRICS = [
  { key: 'calories', value: MOCK_NUTRITION.calories, label: 'cal' },
  { key: 'protein', value: MOCK_NUTRITION.protein, label: 'gm', prefix: 'Protein' },
  { key: 'daily', value: `${MOCK_NUTRITION.dailyPercent}`, label: '%', prefix: 'Daily' },
  { key: 'carbs', value: MOCK_NUTRITION.carbs, label: 'gm', prefix: 'Carbs' },
  { key: 'fat', value: MOCK_NUTRITION.fat, label: 'gm', prefix: 'Fat' },
];

/** Modal popup overlay showing captured food image + nutrition grid */
export function NutritionResultsPopup({
  visible,
  imageUri,
  onRetake,
  onClose,
}: NutritionResultsPopupProps) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onRetake}>
      {/* Dark backdrop — dismiss returns to camera */}
      <Pressable className="flex-1 bg-black/60" onPress={onRetake} />

      {/* Bottom card */}
      <View className="bg-[#1C1C2E] rounded-t-3xl overflow-hidden">
        {/* Food image */}
        {imageUri ? (
          <Image
            source={{ uri: imageUri }}
            className="w-full h-52"
            resizeMode="cover"
          />
        ) : null}

        {/* Nutrition info */}
        <View className="px-5 pt-4 pb-2">
          <Text className="text-white text-lg font-bold mb-3">
            {MOCK_NUTRITION.name}
          </Text>
          <View className="h-px bg-gray-700 mb-4" />

          {/* Metrics grid: 3 top, 2 bottom */}
          <View className="flex-row flex-wrap justify-between mb-4">
            {METRICS.map((metric, index) => (
              <View
                key={metric.key}
                className="items-center mb-4"
                style={{ width: index < 3 ? '33%' : '50%' }}
              >
                <Text className="text-white text-2xl font-bold">{metric.value}</Text>
                <Text className="text-[#9CA3AF] text-xs mt-0.5">
                  {metric.prefix ? `${metric.prefix} · ` : ''}{metric.label}
                </Text>
              </View>
            ))}
          </View>
        </View>

        {/* Action buttons */}
        <View className="flex-row px-5 pb-8 gap-3">
          <Pressable onPress={onRetake} className="flex-1 py-3 rounded-xl items-center bg-gray-700" accessibilityLabel="Retake photo" accessibilityRole="button">
            <Text className="text-white font-semibold">Retake</Text>
          </Pressable>
          <Pressable onPress={onClose} className="flex-1 py-3 rounded-xl items-center bg-[#22c55e]" accessibilityLabel="Save photo" accessibilityRole="button">
            <Text className="text-white font-semibold">Save</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}
