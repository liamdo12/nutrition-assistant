import { View, Text } from 'react-native';
import { SafeScreen } from '@/components/ui/safe-screen';

export default function RegisterScreen() {
  return (
    <SafeScreen>
      <View className="flex-1 items-center justify-center px-6">
        <Text className="text-2xl font-bold text-gray-900">Create Account</Text>
        <Text className="text-gray-500 mt-2">TODO: Implement registration form</Text>
      </View>
    </SafeScreen>
  );
}
