import { useState, useCallback, useEffect, useRef } from 'react';
import {
  useAudioRecorder,
  useAudioRecorderState,
  AudioModule,
} from 'expo-audio';
import { File, Paths } from 'expo-file-system';
import { Platform } from 'react-native';

interface UseAudioChunkedRecorderOptions {
  chunkIntervalMs?: number;
  onChunk: (chunkBase64: string, mimeType: string) => void;
}

interface UseAudioChunkedRecorderReturn {
  isRecording: boolean;
  meterLevel: number;
  startRecording: () => Promise<void>;
  stopRecording: () => Promise<void>;
}

/**
 * Strip the 44-byte WAV header from a base64-encoded WAV file.
 * WAV header is always 44 bytes for standard PCM; 44 bytes = 60 base64 chars
 * (since 44 bytes → ceil(44/3)*4 = 60 chars, and 44 is not on a 3-byte boundary
 * we need to re-encode from decoded bytes to get a clean base64 output).
 */
function stripWavHeaderBase64(wavBase64: string): string {
  // Decode base64 to binary string, skip 44 bytes, re-encode
  const binaryStr = atob(wavBase64);
  if (binaryStr.length <= 44) return '';
  const pcmBinary = binaryStr.substring(44);
  return btoa(pcmBinary);
}

/** Gemini Live API requires raw PCM at 16kHz mono 16-bit */
const MIME_TYPE = 'audio/pcm;rate=16000';

/** Recording options for 16kHz mono 16-bit linear PCM (WAV container) */
const PCM_RECORDING_OPTIONS = Platform.select({
  ios: {
    extension: '.wav',
    sampleRate: 16000,
    numberOfChannels: 1,
    bitRate: 256000,
    outputFormat: 'lpcm',
  },
  android: {
    extension: '.wav',
    sampleRate: 16000,
    numberOfChannels: 1,
    bitRate: 256000,
    outputFormat: 'default',
  },
  default: {
    extension: '.wav',
    sampleRate: 16000,
    numberOfChannels: 1,
    bitRate: 256000,
    outputFormat: 'lpcm',
  },
});

/**
 * Records audio in timed chunks using stop-restart strategy.
 * Each chunk is emitted as base64 via onChunk callback.
 */
export function useAudioChunkedRecorder(
  options: UseAudioChunkedRecorderOptions,
): UseAudioChunkedRecorderReturn {
  const { chunkIntervalMs = 10_000, onChunk } = options;
  const recorder = useAudioRecorder(PCM_RECORDING_OPTIONS);
  const recorderState = useAudioRecorderState(recorder);

  const [isActive, setIsActive] = useState(false);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const isActiveRef = useRef(false);
  const rotatingRef = useRef(false);
  const onChunkRef = useRef(onChunk);
  onChunkRef.current = onChunk;

  // Normalize dB metering (-160..0) to 0..1
  const meterLevel =
    isActive && recorderState.metering !== undefined
      ? Math.max(0, (recorderState.metering + 160) / 160)
      : 0;

  /** Read recorded WAV file as base64, strip WAV header, emit raw PCM chunk */
  const emitChunkFromUri = useCallback(async (uri: string | null) => {
    if (!uri) return;
    try {
      const file = new File(uri);
      if (!file.exists) return;
      const base64 = await file.base64();
      file.delete();
      if (base64.length > 0) {
        const pcmBase64 = stripWavHeaderBase64(base64);
        if (pcmBase64.length > 0) {
          onChunkRef.current(pcmBase64, MIME_TYPE);
        }
      }
    } catch {
      // File may have been deleted by a previous stop call — safe to ignore
    }
  }, []);

  /** Stop current recording, emit chunk, restart if still active. Serialized via rotatingRef. */
  const rotateRecording = useCallback(async () => {
    if (!isActiveRef.current || rotatingRef.current) return;
    rotatingRef.current = true;
    try {
      await recorder.stop();
      const uri = recorder.uri ?? null;

      // Restart recording immediately before processing chunk (minimizes gap)
      if (isActiveRef.current) {
        await recorder.prepareToRecordAsync({ isMeteringEnabled: true });
        recorder.record();
      }

      await emitChunkFromUri(uri);
    } catch (error) {
      console.error('Failed to rotate recording:', error);
    } finally {
      rotatingRef.current = false;
    }
  }, [recorder, emitChunkFromUri]);

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

    isActiveRef.current = true;
    setIsActive(true);

    // Rotate every chunkIntervalMs
    intervalRef.current = setInterval(rotateRecording, chunkIntervalMs);
  }, [recorder, rotateRecording, chunkIntervalMs]);

  const stopRecording = useCallback(async () => {
    isActiveRef.current = false;
    setIsActive(false);

    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }

    try {
      await recorder.stop();
      const uri = recorder.uri ?? null;
      await emitChunkFromUri(uri);
    } catch {
      // Recording may already be stopped
    }
  }, [recorder, emitChunkFromUri]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      isActiveRef.current = false;
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
      recorder.stop().catch(() => {});
    };
  }, [recorder]);

  return { isRecording: isActive, meterLevel, startRecording, stopRecording };
}
