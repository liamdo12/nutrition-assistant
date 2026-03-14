import { Pressable, View, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

type VoiceState = 'idle' | 'recording' | 'muted';

interface VoiceActionBarProps {
  voiceState: VoiceState;
  onMicPress: () => void;
  onClosePress: () => void;
}

export function VoiceActionBar({
  voiceState,
  onMicPress,
  onClosePress,
}: VoiceActionBarProps) {
  const isRecording = voiceState === 'recording';

  return (
    <View style={styles.container}>
      {/* Mic button — centered */}
      <Pressable
        onPress={onMicPress}
        style={[
          styles.micButton,
          isRecording && styles.micButtonRecording,
        ]}
        accessibilityLabel={isRecording ? 'Stop recording' : 'Start recording'}
        accessibilityRole="button"
      >
        <Ionicons
          name={isRecording ? 'stop' : 'mic'}
          size={28}
          color="white"
        />
      </Pressable>

      {/* Close button — bottom right */}
      <Pressable
        onPress={onClosePress}
        style={styles.closeButton}
        accessibilityLabel="Close"
        accessibilityRole="button"
      >
        <Ionicons name="close" size={22} color="rgba(255,255,255,0.8)" />
      </Pressable>
    </View>
  );
}

const CLOSE_SIZE = 48;
const MIC_SIZE = 64;

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
    position: 'relative',
  },
  micButton: {
    width: MIC_SIZE,
    height: MIC_SIZE,
    borderRadius: MIC_SIZE / 2,
    backgroundColor: 'rgba(120, 60, 220, 0.9)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  micButtonRecording: {
    backgroundColor: 'rgba(220, 50, 50, 0.9)',
  },
  closeButton: {
    position: 'absolute',
    right: 24,
    width: CLOSE_SIZE,
    height: CLOSE_SIZE,
    borderRadius: CLOSE_SIZE / 2,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
