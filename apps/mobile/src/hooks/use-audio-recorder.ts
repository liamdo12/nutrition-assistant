import { useState, useRef, useCallback, useEffect } from 'react';
import { Audio } from 'expo-av';

interface UseAudioRecorderReturn {
  isRecording: boolean;
  duration: number;
  meterLevel: number;
  startRecording: () => Promise<void>;
  stopRecording: () => Promise<string | null>;
}

/** Custom hook encapsulating expo-av Audio.Recording lifecycle */
export function useAudioRecorder(maxDuration = 300): UseAudioRecorderReturn {
  const [isRecording, setIsRecording] = useState(false);
  const [duration, setDuration] = useState(0);
  const [meterLevel, setMeterLevel] = useState(0);
  const recordingRef = useRef<Audio.Recording | null>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const meterRef = useRef<NodeJS.Timeout | null>(null);

  const cleanup = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (meterRef.current) clearInterval(meterRef.current);
    timerRef.current = null;
    meterRef.current = null;
  }, []);

  // Cleanup on unmount — stop orphan recordings
  useEffect(() => {
    return () => {
      cleanup();
      if (recordingRef.current) {
        recordingRef.current.stopAndUnloadAsync().catch(() => {});
      }
    };
  }, [cleanup]);

  /** Stops the active recording and returns the file URI, or null on failure */
  const stopRecording = useCallback(async (): Promise<string | null> => {
    cleanup();
    setIsRecording(false);
    setMeterLevel(0);

    if (!recordingRef.current) return null;

    try {
      await recordingRef.current.stopAndUnloadAsync();
      const uri = recordingRef.current.getURI();
      recordingRef.current = null;

      await Audio.setAudioModeAsync({ allowsRecordingIOS: false });

      return uri ?? null;
    } catch (error) {
      console.error('Failed to stop recording:', error);
      recordingRef.current = null;
      return null;
    }
  }, [cleanup]);

  /** Requests permission, configures audio mode, and starts recording */
  const startRecording = useCallback(async () => {
    const permission = await Audio.requestPermissionsAsync();
    if (permission.status !== 'granted') {
      throw new Error('Microphone permission denied');
    }

    await Audio.setAudioModeAsync({
      allowsRecordingIOS: true,
      playsInSilentModeIOS: true,
    });

    const recording = new Audio.Recording();
    await recording.prepareToRecordAsync({
      ...Audio.RecordingOptionsPresets.HIGH_QUALITY,
      isMeteringEnabled: true,
    });
    await recording.startAsync();

    recordingRef.current = recording;
    setIsRecording(true);
    setDuration(0);
    setMeterLevel(0);

    // Duration timer — auto-stops when maxDuration is reached
    let elapsed = 0;
    timerRef.current = setInterval(() => {
      elapsed += 1;
      setDuration(elapsed);
      if (elapsed >= maxDuration) {
        stopRecording();
      }
    }, 1000);

    // Metering poll (100ms)
    meterRef.current = setInterval(async () => {
      try {
        const status = await recording.getStatusAsync();
        if (status.isRecording && status.metering !== undefined) {
          // Normalize dB (-160..0) to 0..1
          const normalized = Math.max(0, (status.metering + 160) / 160);
          setMeterLevel(normalized);
        }
      } catch {
        // Recording may have stopped
      }
    }, 100);
  }, [maxDuration, stopRecording]);

  return { isRecording, duration, meterLevel, startRecording, stopRecording };
}
