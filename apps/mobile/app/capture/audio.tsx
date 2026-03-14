import { useEffect, useRef, useState } from 'react';
import { Alert, Linking, ScrollView, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AuroraBackground } from '../../src/components/ui/aurora-background';
import { AnimatedOrb } from '../../src/components/ui/animated-orb';
import { VoiceActionBar } from '../../src/components/ui/voice-action-bar';
import { useLiveSocket } from '../../src/hooks/use-live-socket';
import { useAudioChunkedRecorder } from '../../src/hooks/use-audio-chunked-recorder';
import { useAudioChunkPlayer } from '../../src/hooks/use-audio-chunk-player';
import { useAuthStore } from '../../src/store/auth.store';
import { formatTime } from '../../src/utils/format-time';

type VoiceState = 'idle' | 'recording' | 'muted';

export default function AudioRecordScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const token = useAuthStore(s => s.token);

  const [voiceState, setVoiceState] = useState<VoiceState>('idle');
  const [aiMessages, setAiMessages] = useState<string[]>([]);
  const currentAiTextRef = useRef('');
  const [streamingText, setStreamingText] = useState('');
  const [duration, setDuration] = useState(0);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const scrollRef = useRef<ScrollView>(null);
  const busyRef = useRef(false);

  const player = useAudioChunkPlayer();

  const socket = useLiveSocket({
    token,
    onModelAudioChunk: (base64, mime) => player.enqueue(base64, mime),
    onModelText: (text) => {
      currentAiTextRef.current += text;
      setStreamingText(currentAiTextRef.current);
    },
    onModelTurnComplete: () => {
      // AI finished responding — finalize current message as a separate entry
      if (currentAiTextRef.current.trim()) {
        setAiMessages(prev => [...prev, currentAiTextRef.current.trim()]);
      }
      currentAiTextRef.current = '';
      setStreamingText('');
    },
    onError: (_code, msg) => Alert.alert('Connection Error', msg),
    onSessionClosed: () => {
      stopTimer();
      recorder.stopRecording().catch(() => {});
      player.stop();
      setVoiceState('idle');
      setAiMessages([]);
      currentAiTextRef.current = '';
      setStreamingText('');
    },
  });

  const recorder = useAudioChunkedRecorder({
    chunkIntervalMs: 10_000,
    onChunk: (base64, mime) => socket.sendAudioChunk(base64, mime),
  });

  // Duration timer helpers
  const startTimer = () => {
    setDuration(0);
    timerRef.current = setInterval(() => setDuration(d => d + 1), 1000);
  };
  const stopTimer = () => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    setDuration(0);
  };

  const handleMicPress = async () => {
    // Debounce: prevent double-tap race conditions
    if (busyRef.current) return;
    busyRef.current = true;
    try {
      await handleMicAction();
    } finally {
      busyRef.current = false;
    }
  };

  const handleMicAction = async () => {
    if (voiceState === 'idle' || voiceState === 'muted') {
      // Start recording
      player.stop();
      try {
        await recorder.startRecording();
        setVoiceState('recording');
        startTimer();
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
    } else {
      // Stop recording → muted
      await recorder.stopRecording();
      socket.sendEndTurn();
      stopTimer();
      setVoiceState('muted');
    }
  };

  const handleClose = async () => {
    stopTimer();
    // Stop recorder first and wait for it to finish before disconnecting/navigating
    try {
      await recorder.stopRecording();
    } catch {
      // Recording may already be stopped
    }
    player.stop();
    socket.disconnect();
    router.replace('/capture/photo');
  };

  // Cleanup timer on unmount (back gesture bypasses handleClose)
  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  const hasMessages = aiMessages.length > 0 || streamingText.length > 0;

  const statusIndicator = () => {
    if (voiceState === 'recording') return `Recording · ${formatTime(duration)}`;
    if (voiceState === 'muted') return 'AI is responding...';
    return '';
  };

  return (
    <AuroraBackground>
      <View
        className="flex-1"
        style={{ paddingTop: insets.top, paddingBottom: insets.bottom }}
      >
        {/* Connection indicator */}
        <View className="flex-row items-center justify-center pt-4">
          <View
            className="w-2 h-2 rounded-full mr-2"
            style={{
              backgroundColor: socket.isConnected
                ? 'rgba(34, 197, 94, 0.9)'
                : 'rgba(239, 68, 68, 0.9)',
            }}
          />
          <Text className="text-gray-500 text-xs">
            {socket.isConnected ? 'Connected' : 'Connecting...'}
          </Text>
        </View>

        {/* Orb + status */}
        <View className="items-center pt-6">
          <AnimatedOrb
            meterLevel={recorder.meterLevel}
            isRecording={voiceState === 'recording'}
          />
          {statusIndicator() ? (
            <Text className="text-gray-400 text-sm mt-4">{statusIndicator()}</Text>
          ) : null}
        </View>

        {/* AI conversation area */}
        <View className="flex-1 mx-4 mt-4 mb-4">
          {!hasMessages && voiceState === 'idle' ? (
            <View className="flex-1 items-center justify-center">
              <Text className="text-white text-3xl font-bold text-center">
                {'How Can I Help\nYou Today?'}
              </Text>
              <Text className="text-gray-400 text-base mt-3">Say Something</Text>
            </View>
          ) : (
            <ScrollView
              ref={scrollRef}
              className="flex-1 rounded-xl px-4 py-3"
              style={{ backgroundColor: 'rgba(0, 0, 0, 0.3)' }}
              onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: true })}
            >
              {aiMessages.map((msg, i) => (
                <Text key={i} className="text-white text-sm leading-5 mb-3">
                  {msg}
                </Text>
              ))}
              {streamingText ? (
                <Text className="text-white text-sm leading-5 mb-3 opacity-90">
                  {streamingText}
                </Text>
              ) : null}
            </ScrollView>
          )}
        </View>

        {/* Bottom controls */}
        <View className="items-center pb-4 gap-5">
          <VoiceActionBar
            voiceState={voiceState}
            onMicPress={handleMicPress}
            onClosePress={handleClose}
          />
        </View>
      </View>
    </AuroraBackground>
  );
}
