import { useState, useCallback, useRef, useEffect } from 'react';
import { createAudioPlayer, AudioModule, AudioPlayer } from 'expo-audio';
import { File, Paths } from 'expo-file-system';

interface UseAudioChunkPlayerReturn {
  isPlaying: boolean;
  enqueue: (chunkBase64: string, mimeType: string) => void;
  stop: () => void;
}

const MAX_QUEUE_SIZE = 50;

/** Default sample rate for Gemini Live API PCM output */
const DEFAULT_PCM_SAMPLE_RATE = 24000;
const PCM_NUM_CHANNELS = 1;
const PCM_BITS_PER_SAMPLE = 16;
const PCM_BYTES_PER_SAMPLE = PCM_BITS_PER_SAMPLE / 8;

/**
 * Minimum PCM bytes to buffer before creating a playable WAV segment.
 * ~1.5s at 24kHz mono 16-bit = 24000 * 2 * 1.5 = 72000 bytes.
 * Larger segments reduce transition frequency and choppiness.
 */
const MIN_BUFFER_BYTES = 72000;

/** Pre-loaded player ready to start instantly when current finishes */
interface PreloadedPlayer {
  player: AudioPlayer;
  file: File;
}

/** Parse sample rate from PCM mime type (e.g. "audio/pcm;rate=24000") */
function parsePcmSampleRate(mimeType: string): number {
  const match = mimeType.match(/rate=(\d+)/);
  return match ? parseInt(match[1], 10) : DEFAULT_PCM_SAMPLE_RATE;
}

/** Check if mime type indicates raw PCM audio */
function isRawPcm(mimeType: string): boolean {
  return mimeType.startsWith('audio/pcm') || mimeType.startsWith('audio/l16');
}

/**
 * Build a 44-byte WAV header for raw PCM data.
 */
function buildWavHeader(pcmByteLength: number, sampleRate: number): Uint8Array {
  const byteRate = sampleRate * PCM_NUM_CHANNELS * PCM_BYTES_PER_SAMPLE;
  const blockAlign = PCM_NUM_CHANNELS * PCM_BYTES_PER_SAMPLE;
  const header = new ArrayBuffer(44);
  const view = new DataView(header);

  writeString(view, 0, 'RIFF');
  view.setUint32(4, 36 + pcmByteLength, true);
  writeString(view, 8, 'WAVE');

  writeString(view, 12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, PCM_NUM_CHANNELS, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, PCM_BITS_PER_SAMPLE, true);

  writeString(view, 36, 'data');
  view.setUint32(40, pcmByteLength, true);

  return new Uint8Array(header);
}

function writeString(view: DataView, offset: number, str: string): void {
  for (let i = 0; i < str.length; i++) {
    view.setUint8(offset + i, str.charCodeAt(i));
  }
}

/** Decode base64 string to Uint8Array */
function base64ToBytes(base64: string): Uint8Array {
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

/** Wrap raw PCM bytes in a WAV container */
function wrapPcmAsWav(pcmBytes: Uint8Array, sampleRate: number): Uint8Array {
  const header = buildWavHeader(pcmBytes.length, sampleRate);
  const wav = new Uint8Array(header.length + pcmBytes.length);
  wav.set(header, 0);
  wav.set(pcmBytes, header.length);
  return wav;
}

/** Get file extension for non-PCM mime types */
function extensionForMime(mimeType: string): string {
  if (mimeType.includes('wav')) return '.wav';
  if (mimeType.includes('mp3') || mimeType.includes('mpeg')) return '.mp3';
  if (mimeType.includes('mp4') || mimeType.includes('m4a')) return '.m4a';
  if (mimeType.includes('ogg')) return '.ogg';
  return '.wav';
}

/** Write WAV bytes to a temp file and create an AudioPlayer for it */
function createPlayerFromBytes(bytes: Uint8Array, ext: string): PreloadedPlayer {
  const fileName = `audio_chunk_${Date.now()}_${Math.random().toString(36).slice(2, 6)}${ext}`;
  const file = new File(Paths.cache, fileName);
  file.write(bytes);
  const player = createAudioPlayer(file.uri);
  return { player, file };
}

/** Safely destroy a preloaded player and its temp file */
function destroyPlayer(p: PreloadedPlayer): void {
  try { p.player.remove(); } catch { /* ignore */ }
  try { p.file.delete(); } catch { /* ignore */ }
}

/**
 * Double-buffered audio chunk player with PCM accumulation.
 *
 * Strategy:
 * 1. Incoming PCM chunks accumulate until ~1.5s of audio buffered
 * 2. Flushed buffer becomes a WAV segment in the play queue
 * 3. While current segment plays, the NEXT segment is pre-loaded
 *    (file written + AudioPlayer created) so transition is instant
 * 4. On didJustFinish: swap pre-loaded → current, start immediately
 */
export function useAudioChunkPlayer(): UseAudioChunkPlayerReturn {
  const [isPlaying, setIsPlaying] = useState(false);
  const mountedRef = useRef(true);
  const stoppedRef = useRef(false);
  const playingRef = useRef(false);
  const audioModeSetRef = useRef(false);

  // Current playing segment
  const currentRef = useRef<PreloadedPlayer | null>(null);
  // Next segment pre-loaded and ready to play instantly
  const nextRef = useRef<PreloadedPlayer | null>(null);

  // PCM accumulation buffer
  const pcmBufferRef = useRef<Uint8Array[]>([]);
  const pcmBufferSizeRef = useRef(0);
  const pcmSampleRateRef = useRef(DEFAULT_PCM_SAMPLE_RATE);

  // Ready-to-play WAV queue (post-buffering, pre-preloading)
  const wavQueueRef = useRef<{ bytes: Uint8Array; ext: string }[]>([]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      resetAll();
    };
  }, []);

  const resetAll = useCallback(() => {
    pcmBufferRef.current = [];
    pcmBufferSizeRef.current = 0;
    wavQueueRef.current = [];
    if (currentRef.current) { destroyPlayer(currentRef.current); currentRef.current = null; }
    if (nextRef.current) { destroyPlayer(nextRef.current); nextRef.current = null; }
  }, []);

  /** Flush accumulated PCM into a single WAV entry in the play queue */
  const flushPcmBuffer = useCallback(() => {
    if (pcmBufferRef.current.length === 0) return;

    const totalSize = pcmBufferSizeRef.current;
    const combined = new Uint8Array(totalSize);
    let offset = 0;
    for (const chunk of pcmBufferRef.current) {
      combined.set(chunk, offset);
      offset += chunk.length;
    }
    pcmBufferRef.current = [];
    pcmBufferSizeRef.current = 0;

    const wavBytes = wrapPcmAsWav(combined, pcmSampleRateRef.current);
    wavQueueRef.current.push({ bytes: wavBytes, ext: '.wav' });
  }, []);

  /** Set audio mode once for playback session */
  const ensureAudioMode = useCallback(async () => {
    if (audioModeSetRef.current) return;
    audioModeSetRef.current = true;
    await AudioModule.setAudioModeAsync({
      playsInSilentMode: true,
      allowsRecording: false,
    });
  }, []);

  /**
   * Try to pre-load the next segment from wavQueue while current plays.
   * This eliminates the file-write + player-creation gap at transition time.
   */
  const tryPreloadNext = useCallback(() => {
    if (nextRef.current) return; // already pre-loaded
    if (stoppedRef.current) return;

    // Flush PCM buffer if WAV queue is empty but buffer has data
    if (wavQueueRef.current.length === 0 && pcmBufferSizeRef.current > 0) {
      flushPcmBuffer();
    }

    const item = wavQueueRef.current.shift();
    if (!item) return;

    try {
      nextRef.current = createPlayerFromBytes(item.bytes, item.ext);
    } catch (error) {
      console.error('Failed to pre-load next audio segment:', error);
    }
  }, [flushPcmBuffer]);

  /** Start playing the next available segment */
  const playNext = useCallback(async () => {
    if (stoppedRef.current || !mountedRef.current) {
      playingRef.current = false;
      audioModeSetRef.current = false;
      if (mountedRef.current) setIsPlaying(false);
      return;
    }

    // Use pre-loaded player if available, otherwise load from queue
    let preloaded = nextRef.current;
    nextRef.current = null;

    if (!preloaded) {
      // No pre-loaded player — flush buffer and try to create one
      if (wavQueueRef.current.length === 0 && pcmBufferSizeRef.current > 0) {
        flushPcmBuffer();
      }
      const item = wavQueueRef.current.shift();
      if (!item) {
        playingRef.current = false;
        audioModeSetRef.current = false;
        if (mountedRef.current) setIsPlaying(false);
        return;
      }
      try {
        preloaded = createPlayerFromBytes(item.bytes, item.ext);
      } catch (error) {
        console.error('Failed to create audio player:', error);
        playNext();
        return;
      }
    }

    try {
      await ensureAudioMode();

      currentRef.current = preloaded;

      preloaded.player.addListener('playbackStatusUpdate', (status) => {
        if (status.didJustFinish) {
          destroyPlayer(preloaded!);
          currentRef.current = null;
          playNext();
        }
      });

      preloaded.player.play();

      // While this segment plays, pre-load the next one for seamless transition
      tryPreloadNext();
    } catch (error) {
      console.error('Failed to play audio segment:', error);
      destroyPlayer(preloaded);
      currentRef.current = null;
      playNext();
    }
  }, [flushPcmBuffer, ensureAudioMode, tryPreloadNext]);

  const enqueue = useCallback(
    (chunkBase64: string, mimeType: string) => {
      if (wavQueueRef.current.length >= MAX_QUEUE_SIZE) {
        console.warn('Audio chunk queue full, dropping oldest');
        wavQueueRef.current.shift();
      }

      const rawBytes = base64ToBytes(chunkBase64);

      if (isRawPcm(mimeType)) {
        pcmSampleRateRef.current = parsePcmSampleRate(mimeType);
        pcmBufferRef.current.push(rawBytes);
        pcmBufferSizeRef.current += rawBytes.length;

        if (pcmBufferSizeRef.current >= MIN_BUFFER_BYTES) {
          flushPcmBuffer();
        }
      } else {
        const ext = extensionForMime(mimeType);
        wavQueueRef.current.push({ bytes: rawBytes, ext });
      }

      // Try to pre-load next segment whenever new data arrives
      if (playingRef.current) {
        tryPreloadNext();
      }

      // Start playback if not running and we have queued WAVs
      if (!playingRef.current && wavQueueRef.current.length > 0) {
        playingRef.current = true;
        stoppedRef.current = false;
        setIsPlaying(true);
        playNext();
      }
    },
    [playNext, flushPcmBuffer, tryPreloadNext],
  );

  const stop = useCallback(() => {
    stoppedRef.current = true;
    pcmBufferRef.current = [];
    pcmBufferSizeRef.current = 0;
    wavQueueRef.current = [];

    if (currentRef.current) { destroyPlayer(currentRef.current); currentRef.current = null; }
    if (nextRef.current) { destroyPlayer(nextRef.current); nextRef.current = null; }

    playingRef.current = false;
    audioModeSetRef.current = false;
    if (mountedRef.current) setIsPlaying(false);
  }, []);

  return { isPlaying, enqueue, stop };
}
