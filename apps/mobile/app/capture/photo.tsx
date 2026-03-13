import { useEffect, useRef, useState } from 'react';
import { Alert, Pressable, Text, View } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { MealDishSuggestion } from '@nutrition/shared';
import { useMediaStore } from '../../src/store/media.store';
import { DishSuggestionsPopup } from '../../src/components/ui/nutrition-results-popup';
import { ModeTogglePill } from '../../src/components/ui/mode-toggle-pill';
import { suggestDishes } from '../../src/services/meal-assistant-api';
import { extractApiErrorMessage } from '../../src/services/extract-api-error-message';

const FLASH_MODES = ['off', 'on', 'auto'] as const;
type FlashMode = (typeof FLASH_MODES)[number];

const FLASH_ICONS: Record<FlashMode, keyof typeof Ionicons.glyphMap> = {
  off: 'flash-off',
  on: 'flash',
  auto: 'flash-outline',
};

export default function PhotoCaptureScreen() {
  const insets = useSafeAreaInsets();
  const addItem = useMediaStore(state => state.addItem);
  const [permission, requestPermission] = useCameraPermissions();

  const cameraRef = useRef<CameraView>(null);
  const [facing, setFacing] = useState<'front' | 'back'>('back');
  const [flash, setFlash] = useState<FlashMode>('off');
  const [isCameraReady, setIsCameraReady] = useState(false);
  const [capturedUri, setCapturedUri] = useState<string | null>(null);
  const [isCapturing, setIsCapturing] = useState(false);

  // API state
  const [suggestions, setSuggestions] = useState<MealDishSuggestion[]>([]);
  const [analysisToken, setAnalysisToken] = useState<string | null>(null);
  const [apiStatus, setApiStatus] = useState<'loading' | 'error' | 'success'>('loading');
  const [errorMessage, setErrorMessage] = useState('');
  const [retryCount, setRetryCount] = useState(0);

  // Call suggest-dishes API when a photo is captured (or retry is triggered)
  useEffect(() => {
    if (!capturedUri) return;

    const controller = new AbortController();
    setApiStatus('loading');
    setSuggestions([]);
    setAnalysisToken(null);
    setErrorMessage('');

    suggestDishes(capturedUri, controller.signal)
      .then(response => {
        if (controller.signal.aborted) return;
        setSuggestions(response.suggestions);
        setAnalysisToken(response.analysisToken);
        setApiStatus('success');
      })
      .catch(error => {
        if (controller.signal.aborted) return;
        setApiStatus('error');
        setErrorMessage(extractApiErrorMessage(error));
      });

    return () => controller.abort();
  }, [capturedUri, retryCount]);

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
        setCapturedUri(result.uri);
      }
    } catch (error) {
      console.error('Photo capture failed:', error);
      Alert.alert('Error', 'Failed to capture photo. Please try again.');
    } finally {
      setIsCapturing(false);
    }
  };

  const handleRetake = () => {
    setCapturedUri(null);
    setSuggestions([]);
    setAnalysisToken(null);
    setApiStatus('loading');
    setErrorMessage('');
  };

  const handleSave = () => {
    if (capturedUri) {
      addItem({ uri: capturedUri, type: 'photo', createdAt: Date.now() });
    }
    handleRetake();
  };

  const handleRetry = () => {
    if (!capturedUri) return;
    setRetryCount(c => c + 1);
  };

  const handleSelectDish = (dish: MealDishSuggestion) => {
    // Future: navigate to generate-recipe screen
    console.log('Selected dish:', dish.id, dish.name);
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

      {/* Dish suggestions popup */}
      <DishSuggestionsPopup
        visible={capturedUri !== null}
        imageUri={capturedUri ?? ''}
        status={apiStatus}
        suggestions={suggestions}
        analysisToken={analysisToken}
        errorMessage={errorMessage}
        onRetake={handleRetake}
        onClose={handleSave}
        onSelectDish={handleSelectDish}
        onRetry={handleRetry}
      />
    </View>
  );
}

