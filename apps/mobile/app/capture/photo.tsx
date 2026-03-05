import { useRef, useState } from 'react';
import { Alert, Pressable, Text, View } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useMediaStore } from '../../src/store/media.store';

const FLASH_MODES = ['off', 'on', 'auto'] as const;
type FlashMode = (typeof FLASH_MODES)[number];

const FLASH_ICONS: Record<FlashMode, keyof typeof Ionicons.glyphMap> = {
  off: 'flash-off',
  on: 'flash',
  auto: 'flash-outline',
};

export default function PhotoCaptureScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const addItem = useMediaStore(state => state.addItem);
  const [permission, requestPermission] = useCameraPermissions();

  const cameraRef = useRef<CameraView>(null);
  const [facing, setFacing] = useState<'front' | 'back'>('back');
  const [flash, setFlash] = useState<FlashMode>('off');
  const [isCameraReady, setIsCameraReady] = useState(false);

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
        <Pressable onPress={() => router.back()} className="mt-6">
          <Text className="text-gray-400">Go Back</Text>
        </Pressable>
      </View>
    );
  }

  const cycleFlash = () => {
    const idx = FLASH_MODES.indexOf(flash);
    setFlash(FLASH_MODES[(idx + 1) % FLASH_MODES.length]);
  };

  const takePicture = async () => {
    if (!cameraRef.current || !isCameraReady) return;
    try {
      const result = await cameraRef.current.takePictureAsync({ quality: 0.8 });
      if (result) {
        addItem({ uri: result.uri, type: 'photo', createdAt: Date.now() });
        Alert.alert('Photo captured', 'Photo saved successfully.');
        router.back();
      }
    } catch (error) {
      console.error('Photo capture failed:', error);
      Alert.alert('Error', 'Failed to capture photo. Please try again.');
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
        {/* Top row */}
        <View
          className="flex-row justify-between items-center px-4"
          style={{ paddingTop: insets.top + 8 }}
        >
          <Pressable onPress={() => router.back()} className="p-2">
            <Ionicons name="close" size={28} color="white" />
          </Pressable>
          <Pressable onPress={cycleFlash} className="p-2">
            <Ionicons name={FLASH_ICONS[flash]} size={24} color="white" />
          </Pressable>
        </View>

        {/* Bottom row */}
        <View
          className="absolute bottom-0 left-0 right-0 flex-row items-center justify-between px-10"
          style={{ paddingBottom: insets.bottom + 24 }}
        >
          {/* Flip camera */}
          <Pressable onPress={() => setFacing(f => (f === 'back' ? 'front' : 'back'))} className="p-2">
            <Ionicons name="camera-reverse-outline" size={30} color="white" />
          </Pressable>

          {/* Capture button */}
          <Pressable
            onPress={takePicture}
            className="w-[70px] h-[70px] rounded-full border-4 border-white items-center justify-center"
          >
            <View className="w-[58px] h-[58px] rounded-full bg-white" />
          </Pressable>

          {/* Spacer for symmetry */}
          <View className="w-[30px]" />
        </View>
      </CameraView>
    </View>
  );
}
