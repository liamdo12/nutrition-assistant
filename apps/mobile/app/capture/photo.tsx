import { useRef, useState } from 'react';
import { Alert, Pressable, Text, View } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { ModeTogglePill } from '../../src/components/ui/mode-toggle-pill';

const FLASH_MODES = ['off', 'on', 'auto'] as const;
type FlashMode = (typeof FLASH_MODES)[number];

const FLASH_ICONS: Record<FlashMode, keyof typeof Ionicons.glyphMap> = {
  off: 'flash-off',
  on: 'flash',
  auto: 'flash-outline',
};

export default function PhotoCaptureScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [permission, requestPermission] = useCameraPermissions();

  const cameraRef = useRef<CameraView>(null);
  const [facing, setFacing] = useState<'front' | 'back'>('back');
  const [flash, setFlash] = useState<FlashMode>('off');
  const [isCameraReady, setIsCameraReady] = useState(false);
  const [isCapturing, setIsCapturing] = useState(false);

  // Permission loading
  if (!permission) return <View className="flex-1 bg-black" />;

  // Permission denied
  if (!permission.granted) {
    return (
      <View className="flex-1 bg-black items-center justify-center p-6">
        <Text className="text-white text-lg text-center mb-4">
          Camera access is needed to take food photos.
        </Text>
        <Pressable onPress={requestPermission} className="bg-green-500 px-6 py-3 rounded-lg">
          <Text className="text-white font-semibold">Grant Permission</Text>
        </Pressable>
        {!permission.canAskAgain && (
          <Text className="text-gray-400 text-sm mt-3 text-center">
            Permission was denied. Please enable camera in your device settings.
          </Text>
        )}
      </View>
    );
  }

  const cycleFlash = () => {
    const idx = FLASH_MODES.indexOf(flash);
    setFlash(FLASH_MODES[(idx + 1) % FLASH_MODES.length]);
  };

  const takePicture = async () => {
    if (!cameraRef.current || !isCameraReady || isCapturing) return;
    setIsCapturing(true);
    try {
      const result = await cameraRef.current.takePictureAsync({ quality: 0.8 });
      if (result) {
        router.push({ pathname: '/capture/food-analysis-result', params: { imageUri: result.uri } });
      }
    } catch (error) {
      console.error('Photo capture failed:', error);
      Alert.alert('Error', 'Failed to capture photo. Please try again.');
    } finally {
      setIsCapturing(false);
    }
  };

  return (
    <View className="flex-1 bg-black">
      <CameraView
        ref={cameraRef}
        style={{ flex: 1 }}
        facing={facing}
        flash={flash}
        animateShutter
        onCameraReady={() => setIsCameraReady(true)}
      >
        {/* Bottom controls wrapper */}
        <View
          className="absolute bottom-0 left-0 right-0 items-center"
          style={{ paddingBottom: insets.bottom + 24 }}
        >
          {/* Mode toggle pill */}
          <View className="mb-6">
            <ModeTogglePill activeMode="camera" />
          </View>

          {/* Control row: flash, capture, flip */}
          <View className="flex-row items-center justify-between w-full px-10">
          {/* Flash toggle */}
          <Pressable onPress={cycleFlash} className="p-2" accessibilityLabel={`Flash ${flash}`} accessibilityRole="button">
            <Ionicons name={FLASH_ICONS[flash]} size={30} color="white" />
          </Pressable>

          {/* Capture button */}
          <Pressable
            onPress={takePicture}
            className="w-[70px] h-[70px] rounded-full border-4 border-white items-center justify-center"
            accessibilityLabel="Take photo"
            accessibilityRole="button"
          >
            <View className="w-[58px] h-[58px] rounded-full bg-white" />
          </Pressable>

          {/* Flip camera */}
          <Pressable onPress={() => setFacing(f => (f === 'back' ? 'front' : 'back'))} className="p-2" accessibilityLabel="Flip camera" accessibilityRole="button">
            <Ionicons name="camera-reverse-outline" size={30} color="white" />
          </Pressable>
          </View>
        </View>
      </CameraView>

    </View>
  );
}
