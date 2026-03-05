import { useState } from 'react';
import { View } from 'react-native';
import { Tabs } from 'expo-router';
import { FabButton } from '../../src/components/ui/fab-button';
import { CaptureBottomSheet } from '../../src/components/ui/capture-bottom-sheet';

export default function TabsLayout() {
  const [isSheetOpen, setIsSheetOpen] = useState(false);

  return (
    <View className="flex-1">
      <Tabs
        screenOptions={{
          tabBarActiveTintColor: '#22c55e',
          tabBarInactiveTintColor: '#6b7280',
          headerShown: false,
        }}
      >
        <Tabs.Screen name="index" options={{ title: 'Dashboard' }} />
        <Tabs.Screen name="log" options={{ title: 'Log Meal' }} />
        <Tabs.Screen name="profile" options={{ title: 'Profile' }} />
      </Tabs>
      <FabButton onPress={() => setIsSheetOpen(true)} />
      <CaptureBottomSheet
        visible={isSheetOpen}
        onClose={() => setIsSheetOpen(false)}
      />
    </View>
  );
}
