import { useEffect, useRef, useState, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';
import Constants from 'expo-constants';

const API_URL = Constants.expoConfig?.extra?.apiUrl ?? 'http://localhost:3000';

interface UseLiveSocketOptions {
  token: string | null;
  onModelAudioChunk?: (chunkBase64: string, mimeType: string) => void;
  onModelText?: (text: string) => void;
  onModelTurnComplete?: () => void;
  onTranscriptPartial?: (text: string) => void;
  onTranscriptFinal?: (text: string) => void;
  onError?: (code: string, message: string) => void;
  onSessionClosed?: (reason: string) => void;
  onMealContextSynced?: (data: {
    analysisJti: string;
    selectedDishId: string | null;
    suggestionsCount: number;
  }) => void;
}

interface UseLiveSocketReturn {
  isConnected: boolean;
  sendAudioChunk: (chunkBase64: string, mimeType: string) => void;
  sendEndTurn: () => void;
  disconnect: () => void;
}

/** Manages Socket.IO connection to /api/v1/agent/live namespace */
export function useLiveSocket(options: UseLiveSocketOptions): UseLiveSocketReturn {
  const { token } = options;
  const [isConnected, setIsConnected] = useState(false);
  const socketRef = useRef<Socket | null>(null);

  // Keep callbacks in refs to avoid reconnecting on callback changes
  const callbacksRef = useRef(options);
  callbacksRef.current = options;

  useEffect(() => {
    const socket = io(`${API_URL}/api/v1/agent/live`, {
      auth: token ? { token } : {},
      transports: ['websocket'],
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
    });

    socketRef.current = socket;

    socket.on('connect', () => setIsConnected(true));
    socket.on('disconnect', () => setIsConnected(false));

    // Surface transport-level errors (auth failure, max reconnect attempts)
    socket.on('connect_error', (err) => {
      callbacksRef.current.onError?.('connect_error', err.message);
    });

    socket.on('model_audio_chunk', (data: { chunkBase64: string; mimeType: string }) => {
      callbacksRef.current.onModelAudioChunk?.(data.chunkBase64, data.mimeType);
    });

    socket.on('model_text', (data: { text: string }) => {
      callbacksRef.current.onModelText?.(data.text);
    });

    socket.on('model_turn_complete', () => {
      callbacksRef.current.onModelTurnComplete?.();
    });

    socket.on('transcript_partial', (data: { text: string }) => {
      callbacksRef.current.onTranscriptPartial?.(data.text);
    });

    socket.on('transcript_final', (data: { text: string }) => {
      callbacksRef.current.onTranscriptFinal?.(data.text);
    });

    socket.on('error', (data: { code: string; message: string }) => {
      callbacksRef.current.onError?.(data.code, data.message);
    });

    socket.on('session_closed', (data: { reason: string }) => {
      callbacksRef.current.onSessionClosed?.(data.reason);
    });

    socket.on('meal_context_synced', (data: { analysisJti: string; selectedDishId: string | null; suggestionsCount: number }) => {
      callbacksRef.current.onMealContextSynced?.(data);
    });

    return () => {
      socket.disconnect();
      socketRef.current = null;
      setIsConnected(false);
    };
  }, [token]);

  const sendAudioChunk = useCallback((chunkBase64: string, mimeType: string) => {
    socketRef.current?.emit('audio_chunk', { chunkBase64, mimeType });
  }, []);

  const sendEndTurn = useCallback(() => {
    socketRef.current?.emit('end_turn');
  }, []);

  const disconnect = useCallback(() => {
    socketRef.current?.disconnect();
    socketRef.current = null;
    setIsConnected(false);
  }, []);

  return { isConnected, sendAudioChunk, sendEndTurn, disconnect };
}
