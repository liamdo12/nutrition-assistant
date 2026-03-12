import { Alert, Linking, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useMediaStore } from '../../src/store/media.store';
import { ModeTogglePill } from '../../src/components/ui/mode-toggle-pill';
import { AuroraBackground } from '../../src/components/ui/aurora-background';
import { AnimatedOrb } from '../../src/components/ui/animated-orb';
import { VoiceActionBar } from '../../src/components/ui/voice-action-bar';
import { useAudioRecorderHook } from '../../src/hooks/use-audio-recorder';
import { formatTime } from '../../src/utils/format-time';

export default function AudioRecordScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const addItem = useMediaStore(state => state.addItem);
  const { isRecording, duration, meterLevel, startRecording, stopRecording } =
    useAudioRecorderHook();

  const handleMicPress = async () => {
    if (isRecording) {
      const uri = await stopRecording();
      if (uri) {
        addItem({ uri, type: 'audio', createdAt: Date.now() });
        Alert.alert('Audio recorded', 'Recording saved successfully.');
        router.back();
      } else {
        Alert.alert('Error', 'Failed to save recording. Please try again.');
      }
    } else {
      try {
        await startRecording();
      } catch (error) {
        const isPermissionError =
          error instanceof Error && error.message.includes('permission');
        Alert.alert(
          isPermissionError ? 'Permission Required' : 'Recording Error',
          isPermissionError
            ? 'Microphone access is needed to record audio.'
            : 'Failed to start recording. Please try again.',
          isPermissionError
            ? [
                { text: 'Cancel', style: 'cancel' },
                { text: 'Open Settings', onPress: () => Linking.openSettings() },
              ]
            : [{ text: 'OK' }],
        );
      }
    }
  };

  const handleClose = () => {
    if (isRecording) {
      Alert.alert('Recording in progress', 'Stop recording before closing?', [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Discard & Close',
          onPress: async () => {
            await stopRecording();
            router.replace('/capture/photo');
          },
        },
      ]);
    } else {
      router.replace('/capture/photo');
    }
  };

  return (
    <AuroraBackground>
      <View
        className="flex-1"
        style={{ paddingTop: insets.top, paddingBottom: insets.bottom }}
      >
        {/* Orb + text area */}
        <View className="flex-1 items-center justify-center px-6">
          <AnimatedOrb meterLevel={meterLevel} isRecording={isRecording} />

          <Text className="text-white text-3xl font-bold text-center mt-10">
            {isRecording ? formatTime(duration) : 'How Can I Help\nYou Today?'}
          </Text>

          <Text className="text-gray-400 text-base mt-3">
            {isRecording ? 'Recording...' : 'Say Something'}
          </Text>
        </View>

        {/* Bottom controls */}
        <View className="items-center pb-4 gap-5">
          <ModeTogglePill activeMode="voice" />
          <VoiceActionBar
            isRecording={isRecording}
            onMicPress={handleMicPress}
            onClosePress={handleClose}
          />
        </View>
      </View>
    </AuroraBackground>
  );
}
