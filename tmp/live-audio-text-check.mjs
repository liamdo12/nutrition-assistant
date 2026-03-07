import { GoogleGenAI, Modality } from '@google/genai';
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
let outText=''; let outAudio=0; let err='';
const done = new Promise(resolve => {
  const t=setTimeout(()=>resolve('timeout'),20000);
  ai.live.connect({
    model:'gemini-2.5-flash-native-audio-latest',
    config:{responseModalities:[Modality.AUDIO], outputAudioTranscription:{}},
    callbacks:{
      onmessage:m=>{
        if (m.text) outText += m.text;
        if (m.serverContent?.outputTranscription?.text) outText += m.serverContent.outputTranscription.text;
        if (m.data) outAudio += m.data.length;
        if (m.serverContent?.turnComplete){clearTimeout(t); resolve('turnComplete');}
      },
      onerror:e=>{err=e?.message||String(e); clearTimeout(t); resolve('error');},
      onclose:()=>{},
    },
  }).then(session=>{
    session.sendClientContent({turns:[{role:'user',parts:[{text:'Say hello in one short sentence'}]}], turnComplete:true});
    setTimeout(()=>{try{session.close();}catch{}},18000);
  }).catch(e=>{err=e instanceof Error?e.message:String(e); clearTimeout(t); resolve('connect_error');});
});
const reason=await done;
if (err) console.log('LIVE_AUDIO_ERR='+err);
console.log('LIVE_AUDIO_REASON='+reason);
console.log('LIVE_AUDIO_TEXT='+outText.slice(0,300));
console.log('LIVE_AUDIO_BYTES='+outAudio);
