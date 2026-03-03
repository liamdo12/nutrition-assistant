import { View, Text } from 'react-native';
import { SafeScreen } from '@/components/ui/safe-screen';

export default function LogScreen() {
  return (
    <SafeScreen>
      <View className="flex-1 items-center justify-center">
        <Text className="text-xl font-bold text-gray-900">Log Meal</Text>
        <Text className="text-gray-500 mt-2">Track your food intake</Text>
      </View>
    </SafeScreen>
  );
}
