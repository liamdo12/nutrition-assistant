import { View, Text } from 'react-native';
import { SafeScreen } from '@/components/ui/safe-screen';

export default function LoginScreen() {
  return (
    <SafeScreen>
      <View className="flex-1 items-center justify-center px-6">
        <Text className="text-2xl font-bold text-gray-900">Sign In</Text>
        <Text className="text-gray-500 mt-2">TODO: Implement login form</Text>
      </View>
    </SafeScreen>
  );
}
