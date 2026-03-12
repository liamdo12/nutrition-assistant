import 'dotenv/config';
import { ExpoConfig, ConfigContext } from 'expo/config';

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: 'Nutrition Assistant',
  slug: 'nutrition-assistant',
  version: '1.0.0',
  orientation: 'portrait',
  icon: './assets/icon.png',
  scheme: 'nutrition-assistant',
  userInterfaceStyle: 'automatic',
  splash: {
    image: './assets/splash-icon.png',
    resizeMode: 'contain',
    backgroundColor: '#ffffff',
  },
  ios: {
    supportsTablet: false,
    bundleIdentifier: 'com.nutritionassistant.app',
  },
  android: {
    adaptiveIcon: {
      foregroundImage: './assets/android-icon-foreground.png',
      backgroundImage: './assets/android-icon-background.png',
      monochromeImage: './assets/android-icon-monochrome.png',
    },
    package: 'com.nutritionassistant.app',
  },
  plugins: [
    'expo-router',
    [
      'expo-camera',
      {
        cameraPermission:
          'Allow Nutrition Assistant to access your camera to capture food photos and videos.',
        microphonePermission:
          'Allow Nutrition Assistant to use the microphone for video and audio recording.',
      },
    ],
    [
      'expo-audio',
      {
        microphonePermission:
          'Allow Nutrition Assistant to use the microphone for audio recording.',
      },
    ],
  ],
  experiments: {
    typedRoutes: true,
  },
  extra: {
    apiUrl: process.env.API_URL ?? 'http://localhost:3000',
    eas: {
      projectId: 'da3f66a5-0cb8-45fb-ab7c-62aa30ffd7f0',
    },
  },
});
