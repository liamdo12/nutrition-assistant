import { GoogleGenAI, Modality } from '@google/genai';
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
let out = '';
let err = '';
const done = new Promise(resolve => {
  const t = setTimeout(() => resolve('timeout'), 15000);
  ai.live.connect({
    model: 'gemini-2.5-flash-native-audio-latest',
    config: { responseModalities: [Modality.TEXT] },
    callbacks: {
      onmessage: m => {
        if (m.text) out += m.text;
        if (m.serverContent?.turnComplete) { clearTimeout(t); resolve('turnComplete'); }
      },
      onerror: e => { err = e?.message || String(e); clearTimeout(t); resolve('error'); },
      onclose: () => {},
    },
  }).then(session => {
    session.sendClientContent({
      turns:[{role:'user', parts:[{text:'Reply with {"ok":true} only'}]}],
      turnComplete:true,
    });
    setTimeout(() => { try { session.close(); } catch {} }, 12000);
  }).catch(e => { err = e instanceof Error ? e.message : String(e); clearTimeout(t); resolve('connect_error'); });
});
const reason = await done;
if (err) console.log('LIVE_TEXT_ERR=' + err);
console.log('LIVE_TEXT_REASON=' + reason);
console.log('LIVE_TEXT_OUT=' + out.slice(0,300));
