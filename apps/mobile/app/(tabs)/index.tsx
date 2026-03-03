import { View, Text } from 'react-native';
import { SafeScreen } from '@/components/ui/safe-screen';

export default function DashboardScreen() {
  return (
    <SafeScreen>
      <View className="flex-1 items-center justify-center">
        <Text className="text-xl font-bold text-gray-900">Dashboard</Text>
        <Text className="text-gray-500 mt-2">Your nutrition summary</Text>
      </View>
    </SafeScreen>
  );
}
