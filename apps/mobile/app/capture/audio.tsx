import { Alert, Pressable, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useMediaStore } from '../../src/store/media.store';
import { useAudioRecorder } from '../../src/hooks/use-audio-recorder';
import { formatTime } from '../../src/utils/format-time';

export default function AudioRecordScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const addItem = useMediaStore(state => state.addItem);
  const { isRecording, duration, meterLevel, startRecording, stopRecording } = useAudioRecorder();

  const handleStart = async () => {
    try {
      await startRecording();
    } catch {
      Alert.alert('Permission Required', 'Microphone access is needed to record audio.');
    }
  };

  const handleStop = async () => {
    const uri = await stopRecording();
    if (uri) {
      addItem({ uri, type: 'audio', createdAt: Date.now() });
      Alert.alert('Audio recorded', 'Recording saved successfully.');
      router.back();
    } else {
      Alert.alert('Error', 'Failed to save recording. Please try again.');
    }
  };

  const handleClose = () => {
    if (isRecording) {
      Alert.alert('Recording in progress', 'Stop recording before closing?', [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Stop & Close',
          onPress: async () => {
            await stopRecording();
            router.back();
          },
        },
      ]);
    } else {
      router.back();
    }
  };

  return (
    <View className="flex-1 bg-gray-900">
      {/* Close button */}
      <View className="px-4" style={{ paddingTop: insets.top + 8 }}>
        <Pressable onPress={handleClose} className="p-2 self-start">
          <Ionicons name="close" size={28} color="white" />
        </Pressable>
      </View>

      {/* Center content */}
      <View className="flex-1 items-center justify-center px-6">
        {/* Recording indicator */}
        {isRecording && (
          <View className="flex-row items-center mb-4">
            <View className="w-3 h-3 rounded-full bg-red-500 mr-2" />
            <Text className="text-red-400 text-base">Recording</Text>
          </View>
        )}

        {/* Timer */}
        <Text className="text-white text-5xl font-mono mb-6">{formatTime(duration)}</Text>

        {/* Audio level bar */}
        <AudioLevelBar level={meterLevel} />

        {/* Start / Stop button */}
        <View className="mt-10">
          {isRecording ? (
            <Pressable
              onPress={handleStop}
              className="bg-red-500 flex-row items-center px-8 py-4 rounded-full"
            >
              <Ionicons name="stop" size={24} color="white" />
              <Text className="text-white font-semibold text-lg ml-2">Stop</Text>
            </Pressable>
          ) : (
            <Pressable
              onPress={handleStart}
              className="bg-green-500 flex-row items-center px-8 py-4 rounded-full"
            >
              <Ionicons name="mic" size={24} color="white" />
              <Text className="text-white font-semibold text-lg ml-2">Start Recording</Text>
            </Pressable>
          )}
        </View>
      </View>

      {/* Bottom spacer for safe area */}
      <View style={{ height: insets.bottom + 16 }} />
    </View>
  );
}

/** Simple horizontal bar showing audio input level */
function AudioLevelBar({ level }: { level: number }) {
  return (
    <View className="w-48 h-3 bg-gray-700 rounded-full overflow-hidden">
      <View
        className="h-full bg-green-500 rounded-full"
        style={{ width: `${Math.min(level * 100, 100)}%` }}
      />
    </View>
  );
}
