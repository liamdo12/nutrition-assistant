import { GoogleGenAI, Modality } from '@google/genai';
import { readFileSync, writeFileSync } from 'node:fs';
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
const image = readFileSync('docs/image-to-test.jpg').toString('base64');
let all=''; let err=''; let session;
const reason = await new Promise(resolve => {
  const t=setTimeout(()=>resolve('timeout'), 70000);
  ai.live.connect({
    model:'gemini-2.5-flash-native-audio-latest',
    config:{responseModalities:[Modality.AUDIO], outputAudioTranscription:{}},
    callbacks:{
      onmessage:m=>{
        const parts=m.serverContent?.modelTurn?.parts??[];
        for (const p of parts){ if(p.text) all += (p.text + '\n'); }
        const tr=m.serverContent?.outputTranscription?.text;
        if(tr) all += ('[TR] '+tr+'\n');
        if(m.serverContent?.turnComplete){clearTimeout(t); resolve('turnComplete');}
      },
      onerror:e=>{err=e?.message||String(e); clearTimeout(t); resolve('error');},
      onclose:()=>{},
    },
  }).then(s=>{
    session=s;
    s.sendClientContent({
      turns:[{role:'user',parts:[{text:'You are a cooking assistant. Detect ingredients from the image and suggest possible dishes. Return strict JSON only with this shape: {"suggestions":[{"id":"dish_1","name":"...","reason":"...","estimatedNutrition":{"calories":123,"protein":12,"carbs":20,"fats":5}}]}. Use English output language. Return between 5 options. Locale hint: en User constraints: high protein'},{inlineData:{mimeType:'image/jpeg',data:image}}]}],
      turnComplete:true,
    });
  }).catch(e=>{err=e instanceof Error?e.message:String(e); clearTimeout(t); resolve('connect_error');});
});
try { session?.close(); } catch {}
writeFileSync('tmp/native-audio-suggest-output.txt', all, 'utf8');
console.log('REASON='+reason);
console.log('ERR='+err);
console.log('LEN='+all.length);
console.log('HAS_BRACE=' + (all.includes('{') && all.includes('}')));
