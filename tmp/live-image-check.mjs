import { GoogleGenAI, Modality } from '@google/genai';
import { readFileSync } from 'node:fs';

const apiKey = process.env.GEMINI_API_KEY;
const ai = new GoogleGenAI({ apiKey });

const imageBase64 = readFileSync('docs/image-to-test.jpg').toString('base64');

let gotAny = false;
let textOut = '';
let fatalError = '';

const done = new Promise(resolve => {
  let timer = setTimeout(() => resolve(), 10000);

  ai.live.connect({
    model: 'gemini-2.5-flash-native-audio-dialog',
    config: {
      responseModalities: [Modality.TEXT],
      inputAudioTranscription: {},
      outputAudioTranscription: {},
    },
    callbacks: {
      onmessage: m => {
        if (m.text) {
          gotAny = true;
          textOut += m.text;
        }
        if (m.serverContent?.turnComplete) {
          clearTimeout(timer);
          resolve();
        }
      },
      onerror: e => {
        fatalError = e?.message || String(e);
        clearTimeout(timer);
        resolve();
      },
      onclose: () => {},
    },
  }).then(session => {
    session.sendClientContent({
      turns: [{
        role: 'user',
        parts: [
          { text: 'Describe this image in one short sentence.' },
          { inlineData: { mimeType: 'image/jpeg', data: imageBase64 } },
        ],
      }],
      turnComplete: true,
    });

    setTimeout(() => {
      try { session.close(); } catch {}
    }, 9000);
  }).catch(err => {
    fatalError = err instanceof Error ? err.message : String(err);
    clearTimeout(timer);
    resolve();
  });
});

await done;

if (fatalError) {
  console.log('IMAGE_TEST_STATUS=ERROR');
  console.log('IMAGE_TEST_ERROR=' + fatalError);
} else if (gotAny) {
  console.log('IMAGE_TEST_STATUS=OK');
  console.log('IMAGE_TEST_TEXT=' + textOut.slice(0, 300));
} else {
  console.log('IMAGE_TEST_STATUS=NO_RESPONSE');
}
