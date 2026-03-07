import { GoogleGenAI, Modality } from '@google/genai';
import { readFileSync } from 'node:fs';
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
const image = readFileSync('docs/image-to-test.jpg').toString('base64');

async function run(mode) {
  let all=''; let err='';
  let session;
  const reason = await new Promise(resolve => {
    const t=setTimeout(()=>resolve('timeout'), 45000);
    ai.live.connect({
      model:'gemini-2.5-flash-native-audio-latest',
      config: mode==='TEXT' ? {responseModalities:[Modality.TEXT]} : {responseModalities:[Modality.AUDIO], outputAudioTranscription:{}},
      callbacks:{
        onmessage:m=>{
          const parts=m.serverContent?.modelTurn?.parts??[];
          for (const p of parts){ if(p.text) all += (p.text + '\n'); }
          const tr=m.serverContent?.outputTranscription?.text;
          if(tr) all += ('[TR] '+tr+'\n');
          if(m.text) all += ('[TXT] '+m.text+'\n');
          if(m.serverContent?.turnComplete){clearTimeout(t); resolve('turnComplete');}
        },
        onerror:e=>{err=e?.message||String(e); clearTimeout(t); resolve('error');},
        onclose:()=>{},
      }
    }).then(s=>{
      session=s;
      s.sendClientContent({
        turns:[{role:'user',parts:[{text:'You are a cooking assistant. Return strict JSON only with this shape: {"suggestions":[{"id":"dish_1","name":"...","reason":"..."}]}. Use 5 items.'},{inlineData:{mimeType:'image/jpeg',data:image}}]}],
        turnComplete:true,
      });
    }).catch(e=>{err=e instanceof Error?e.message:String(e); clearTimeout(t); resolve('connect_error');});
  });
  try { session?.close(); } catch {}
  console.log('MODE='+mode+' REASON='+reason);
  if (err) console.log('ERR='+err);
  console.log('OUT='+all.slice(0,2000));
}

await run('TEXT');
await run('AUDIO');
