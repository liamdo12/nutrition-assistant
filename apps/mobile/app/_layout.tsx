import '../global.css';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';

export default function RootLayout() {
  return (
    <>
      <Stack initialRouteName="index">
        <Stack.Screen
          name="index"
          options={{ headerShown: false }}
        />
        <Stack.Screen
          name="capture/photo"
          options={{ headerShown: false }}
        />
        <Stack.Screen
          name="capture/food-analysis-result"
          options={{ headerShown: false }}
        />
        <Stack.Screen
          name="capture/audio"
          options={{ headerShown: false, presentation: 'fullScreenModal' }}
        />
      </Stack>
      <StatusBar style="light" />
    </>
  );
}
