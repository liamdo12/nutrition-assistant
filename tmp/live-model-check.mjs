import { GoogleGenAI, Modality } from '@google/genai';

const apiKey = process.env.GEMINI_API_KEY;
if (!apiKey) {
  console.log('LIVE_TEST_STATUS=NO_API_KEY');
  process.exit(0);
}

const ai = new GoogleGenAI({ apiKey });

let session;
try {
  session = await ai.live.connect({
    model: 'gemini-2.5-flash-native-audio-dialog',
    config: {
      responseModalities: [Modality.AUDIO],
      inputAudioTranscription: {},
      outputAudioTranscription: {},
    },
    callbacks: {
      onmessage: () => {},
      onerror: e => {
        console.log('LIVE_TEST_SOCKET_ERROR=' + (e?.message ?? 'unknown'));
      },
      onclose: e => {
        console.log('LIVE_TEST_CLOSED=' + (e?.reason ?? 'no-reason'));
      },
    },
  });

  console.log('LIVE_TEST_STATUS=CONNECTED');
  session.close();
  await new Promise(r => setTimeout(r, 300));
} catch (error) {
  console.log('LIVE_TEST_STATUS=FAILED');
  console.log('LIVE_TEST_ERROR=' + (error instanceof Error ? error.message : String(error)));
} finally {
  try { session?.close(); } catch {}
}
