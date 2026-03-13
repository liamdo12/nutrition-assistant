import { useState, useCallback, useEffect, useRef } from 'react';
import {
  useAudioRecorder,
  useAudioRecorderState,
  RecordingPresets,
  AudioModule,
} from 'expo-audio';

interface UseAudioRecorderReturn {
  isRecording: boolean;
  duration: number;
  meterLevel: number;
  startRecording: () => Promise<void>;
  stopRecording: () => Promise<string | null>;
}

/** Custom hook encapsulating expo-audio recording lifecycle */
export function useAudioRecorderHook(maxDuration = 300): UseAudioRecorderReturn {
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const recorderState = useAudioRecorderState(recorder);

  const [duration, setDuration] = useState(0);
  const [isActive, setIsActive] = useState(false);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  // Derive metering: normalize dB (-160..0) to 0..1
  const meterLevel =
    isActive && recorderState.metering !== undefined
      ? Math.max(0, (recorderState.metering + 160) / 160)
      : 0;

  const stopRecording = useCallback(async (): Promise<string | null> => {
    setIsActive(false);
    setDuration(0);

    try {
      await recorder.stop();
      return recorder.uri ?? null;
    } catch (error) {
      console.error('Failed to stop recording:', error);
      return null;
    }
  }, [recorder]);

  // Duration timer with auto-stop at maxDuration
  const stopRecordingRef = useRef(stopRecording);
  useEffect(() => {
    stopRecordingRef.current = stopRecording;
  }, [stopRecording]);

  useEffect(() => {
    if (isActive) {
      let elapsed = 0;
      timerRef.current = setInterval(() => {
        elapsed += 1;
        if (elapsed >= maxDuration) {
          stopRecordingRef.current();
          return;
        }
        setDuration(elapsed);
      }, 1000);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
      timerRef.current = null;
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isActive, maxDuration]);

  const startRecording = useCallback(async () => {
    const status = await AudioModule.requestRecordingPermissionsAsync();
    if (!status.granted) {
      throw new Error('Microphone permission denied');
    }

    await AudioModule.setAudioModeAsync({
      playsInSilentMode: true,
      allowsRecording: true,
    });
    await recorder.prepareToRecordAsync({ isMeteringEnabled: true });
    recorder.record();

    setIsActive(true);
    setDuration(0);
  }, [recorder]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (isActive) {
        recorder.stop().catch(() => {});
      }
    };
  }, [isActive, recorder]);

  return {
    isRecording: isActive,
    duration,
    meterLevel,
    startRecording,
    stopRecording,
  };
}
