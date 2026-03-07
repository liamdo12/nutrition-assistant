import { GoogleGenAI, Modality } from '@google/genai';
import { readFileSync } from 'node:fs';
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
const img = readFileSync('docs/image-to-test.jpg').toString('base64');
let txt=''; let audio=0; let err='';
const done = new Promise(resolve => {
  const t = setTimeout(()=>resolve('timeout'),30000);
  ai.live.connect({
    model:'gemini-2.5-flash-native-audio-latest',
    config:{responseModalities:[Modality.AUDIO], outputAudioTranscription:{}},
    callbacks:{
      onmessage:m=>{
        if (m.text) txt += m.text;
        if (m.serverContent?.outputTranscription?.text) txt += m.serverContent.outputTranscription.text;
        if (m.data) audio += m.data.length;
        if (m.serverContent?.turnComplete){clearTimeout(t); resolve('turnComplete');}
      },
      onerror:e=>{err=e?.message||String(e); clearTimeout(t); resolve('error');},
      onclose:()=>{},
    },
  }).then(session=>{
    session.sendClientContent({
      turns:[{role:'user',parts:[{text:'What food is in this image? Reply one sentence.'},{inlineData:{mimeType:'image/jpeg',data:img}}]}],
      turnComplete:true,
    });
    setTimeout(()=>{try{session.close();}catch{}},28000);
  }).catch(e=>{err=e instanceof Error?e.message:String(e); clearTimeout(t); resolve('connect_error');});
});
const reason=await done;
if (err) console.log('LIVE_IMG_ERR='+err);
console.log('LIVE_IMG_REASON='+reason);
console.log('LIVE_IMG_TEXT='+txt.slice(0,500));
console.log('LIVE_IMG_AUDIO_BYTES='+audio);
