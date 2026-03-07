import { GoogleGenAI, Modality } from '@google/genai';
import { readFileSync } from 'node:fs';

const apiKey = process.env.GEMINI_API_KEY;
const ai = new GoogleGenAI({ apiKey });
const imageBase64 = readFileSync('docs/image-to-test.jpg').toString('base64');

let gotText = '';
let gotAudioBytes = 0;
let gotAny = false;
let fatal = '';

const done = new Promise(resolve => {
  const timer = setTimeout(() => resolve('timeout'), 25000);

  ai.live.connect({
    model: 'gemini-2.5-flash-native-audio-dialog',
    config: {
      responseModalities: [Modality.AUDIO],
      outputAudioTranscription: {},
      inputAudioTranscription: {},
    },
    callbacks: {
      onmessage: m => {
        const st = m.serverContent;
        if (m.text) {
          gotAny = true;
          gotText += m.text;
        }
        if (st?.outputTranscription?.text) {
          gotAny = true;
          gotText += st.outputTranscription.text;
        }
        if (m.data) {
          gotAny = true;
          gotAudioBytes += m.data.length;
        }
        if (st?.turnComplete) {
          clearTimeout(timer);
          resolve('turn_complete');
        }
      },
      onerror: e => {
        fatal = e?.message || String(e);
        clearTimeout(timer);
        resolve('error');
      },
      onclose: () => {},
    },
  }).then(session => {
    session.sendRealtimeInput({
      media: {
        mimeType: 'image/jpeg',
        data: imageBase64,
      },
    });

    session.sendClientContent({
      turns: [{
        role: 'user',
        parts: [{ text: 'Please describe the image briefly.' }],
      }],
      turnComplete: true,
    });

    setTimeout(() => {
      try { session.close(); } catch {}
    }, 24000);
  }).catch(err => {
    fatal = err instanceof Error ? err.message : String(err);
    clearTimeout(timer);
    resolve('connect_error');
  });
});

const reason = await done;

if (fatal) {
  console.log('IMAGE_RT_STATUS=ERROR');
  console.log('IMAGE_RT_ERROR=' + fatal);
} else {
  console.log('IMAGE_RT_STATUS=' + (gotAny ? 'OK' : 'NO_RESPONSE'));
  console.log('IMAGE_RT_REASON=' + reason);
  console.log('IMAGE_RT_TEXT=' + gotText.slice(0, 300));
  console.log('IMAGE_RT_AUDIO_BYTES=' + gotAudioBytes);
}
