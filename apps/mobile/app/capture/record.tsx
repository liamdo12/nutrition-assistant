import { useEffect, useRef, useState } from 'react';
import { Alert, Pressable, Text, View } from 'react-native';
import { CameraView, useCameraPermissions, useMicrophonePermissions } from 'expo-camera';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useMediaStore } from '../../src/store/media.store';
import { formatTime } from '../../src/utils/format-time';

const MAX_DURATION_MS = 60_000;

export default function VideoRecordScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const addItem = useMediaStore(state => state.addItem);

  const [cameraPermission, requestCamera] = useCameraPermissions();
  const [micPermission, requestMic] = useMicrophonePermissions();

  const cameraRef = useRef<CameraView>(null);
  const [facing, setFacing] = useState<'front' | 'back'>('back');
  const [isCameraReady, setIsCameraReady] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [duration, setDuration] = useState(0);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  // Cleanup timer on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  const allGranted = cameraPermission?.granted && micPermission?.granted;

  const requestAllPermissions = async () => {
    const cam = await requestCamera();
    if (cam?.granted) await requestMic();
  };

  // Permission loading
  if (!cameraPermission || !micPermission) return <View className="flex-1 bg-black" />;

  // Permission denied
  if (!allGranted) {
    return (
      <View className="flex-1 bg-black items-center justify-center p-6">
        <Text className="text-white text-lg text-center mb-4">
          Camera and microphone access are needed to record video.
        </Text>
        <Pressable onPress={requestAllPermissions} className="bg-green-500 px-6 py-3 rounded-lg">
          <Text className="text-white font-semibold">Grant Permissions</Text>
        </Pressable>
        {(!cameraPermission.canAskAgain || !micPermission.canAskAgain) && (
          <Text className="text-gray-400 text-sm mt-3 text-center">
            Permission was denied. Please enable camera and microphone in your device settings.
          </Text>
        )}
        <Pressable onPress={() => router.back()} className="mt-6">
          <Text className="text-gray-400">Go Back</Text>
        </Pressable>
      </View>
    );
  }

  const startRecording = async () => {
    if (!cameraRef.current || !isCameraReady || isRecording) return;
    try {
      setIsRecording(true);
      setDuration(0);

      timerRef.current = setInterval(() => {
        setDuration(prev => prev + 1);
      }, 1000);

      const result = await cameraRef.current.recordAsync({
        maxDuration: MAX_DURATION_MS / 1000,
        maxFileSize: 50 * 1024 * 1024,
      });

      // Resolves after recording stops
      if (result) {
        addItem({ uri: result.uri, type: 'video', createdAt: Date.now() });
        Alert.alert('Video recorded', 'Video saved successfully.');
        router.back();
      }
    } catch (error) {
      console.error('Recording failed:', error);
      Alert.alert('Error', 'Failed to record video.');
    } finally {
      setIsRecording(false);
      if (timerRef.current) clearInterval(timerRef.current);
    }
  };

  const stopRecording = async () => {
    if (!cameraRef.current || !isRecording) return;
    try {
      await cameraRef.current.stopRecording();
    } catch (error) {
      console.error('Stop recording failed:', error);
    }
  };

  const handleClose = () => {
    if (isRecording) {
      Alert.alert('Recording in progress', 'Stop recording before closing?', [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Stop & Close',
          onPress: () => stopRecording(),
        },
      ]);
    } else {
      router.back();
    }
  };

  return (
    <View className="flex-1 bg-black">
      <CameraView
        ref={cameraRef}
        style={{ flex: 1 }}
        facing={facing}
        mode="video"
        onCameraReady={() => setIsCameraReady(true)}
      >
        {/* Top row */}
        <View
          className="flex-row justify-between items-center px-4"
          style={{ paddingTop: insets.top + 8 }}
        >
          <Pressable onPress={handleClose} className="p-2">
            <Ionicons name="close" size={28} color="white" />
          </Pressable>

          {/* Timer (visible only when recording) */}
          {isRecording && (
            <View className="flex-row items-center">
              <View className="w-3 h-3 rounded-full bg-red-500 mr-2" />
              <Text className="text-white text-base font-mono">{formatTime(duration)}</Text>
            </View>
          )}

          {/* Spacer for layout symmetry */}
          <View className="w-7" />
        </View>

        {/* Bottom row */}
        <View
          className="absolute bottom-0 left-0 right-0 flex-row items-center justify-between px-10"
          style={{ paddingBottom: insets.bottom + 24 }}
        >
          {/* Flip camera (disabled during recording) */}
          <Pressable
            onPress={() => setFacing(f => (f === 'back' ? 'front' : 'back'))}
            disabled={isRecording}
            className="p-2"
            style={{ opacity: isRecording ? 0.3 : 1 }}
          >
            <Ionicons name="camera-reverse-outline" size={30} color="white" />
          </Pressable>

          {/* Record / Stop button */}
          <Pressable
            onPress={isRecording ? stopRecording : startRecording}
            className="w-[70px] h-[70px] rounded-full border-4 border-white items-center justify-center"
          >
            {isRecording ? (
              <View className="w-6 h-6 rounded bg-red-500" />
            ) : (
              <View className="w-[58px] h-[58px] rounded-full bg-red-500" />
            )}
          </Pressable>

          {/* Spacer */}
          <View className="w-[30px]" />
        </View>
      </CameraView>
    </View>
  );
}
