'use strict';
const voice={session:null,serial:0};
function voiceContext(){return JSON.stringify([state.demo,state.player,state.round,state.labeller,clipFlow.active?.id||null]);}
function leaveVoice(){if(voice.session)throw new Error('Insert or discard the voice note before switching reviews.');}
function voiceStatus(text){$('voiceStatus').textContent=text;}
function releaseMic(s){clearInterval(s.timer);s.stream?.getTracks().forEach(t=>t.stop());}
function discardVoice(){const s=voice.session;voice.session=null;voice.serial++;if(s){s.cancelled=true;if(s.recorder?.state==='recording')s.recorder.stop();releaseMic(s);} $('voicePanel').hidden=true;$('voicePreview').value='';}
async function transcribeVoice(){
  const s=voice.session;if(!s?.blob)return;
  $('voiceRetry').hidden=true;$('voiceInsert').disabled=true;voiceStatus('Transcribing locally… You can keep watching the clip.');
  s.busy=true;
  try{
    const result=await api('/api/voice/transcribe?language='+s.language,{method:'POST',headers:{'Content-Type':s.blob.type||'application/octet-stream'},body:s.blob});
    if(voice.session!==s)return;
    $('voicePreview').value=result.text;$('voicePreview').hidden=false;$('voiceInsert').hidden=false;$('voiceInsert').disabled=!result.text.trim();
    voiceStatus(result.text.trim()?'Review the transcript, then insert it into your note.':'No speech recognised. You can type a correction here or discard and record again.');
  }catch(e){if(voice.session===s){voiceStatus(e.message+' Your recording is kept in this tab for retry.');$('voiceRetry').hidden=false;}}
  finally{s.busy=false;}
}
async function startVoice(target){
  leaveVoice();if(target.disabled||!state.replay)throw new Error('Open an editable annotation first.');
  if(!navigator.mediaDevices?.getUserMedia||!window.MediaRecorder)throw new Error('Microphone recording is unavailable in this browser. Open the localhost labeler in Chrome, Edge or Firefox.');
  const s={target,context:voiceContext(),language:(target.id==='clipNotes'?$('clipLanguage'):$('language')).value,token:++voice.serial};
  voice.session=s;$('voicePanel').hidden=false;$('voicePreview').hidden=true;$('voiceInsert').hidden=true;$('voiceRetry').hidden=true;$('voiceStop').hidden=true;
  $('voiceTitle').textContent='Voice note · '+(target.closest('label')?.firstChild?.textContent?.trim()||'Annotation');
  $('voiceLanguage').textContent=s.language==='pl'?'Polish':'English';
  voiceStatus('Checking local speech recognition…');$('voicePanel').scrollIntoView({block:'nearest'});
  try{
    const status=await api('/api/voice/status');if(voice.session!==s)return;
    if(!status.ready)throw new Error(status.detail);
    if(status.busy)throw new Error('Another voice note is being transcribed. Try again shortly.');
    voiceStatus('Allow microphone access to start speaking.');
    const stream=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true},video:false});
    if(voice.session!==s){stream.getTracks().forEach(t=>t.stop());return;}
    s.stream=stream;const mime=['audio/webm;codecs=opus','audio/ogg;codecs=opus','audio/mp4'].find(t=>MediaRecorder.isTypeSupported(t));
    const recorder=new MediaRecorder(stream,mime?{mimeType:mime}:{});s.recorder=recorder;s.parts=[];
    recorder.ondataavailable=e=>{if(e.data.size)s.parts.push(e.data);};
    recorder.onerror=()=>{s.cancelled=true;releaseMic(s);voiceStatus('Microphone recording failed. Discard this note and try again.');$('voiceStop').hidden=true;};
    recorder.onstop=()=>{releaseMic(s);if(voice.session!==s||s.cancelled)return;$('voiceStop').hidden=true;s.blob=new Blob(s.parts,{type:recorder.mimeType});transcribeVoice();};
    recorder.start(1000);s.started=Date.now();$('voiceStop').hidden=false;
    const tick=()=>{const seconds=Math.floor((Date.now()-s.started)/1000);voiceStatus(`Recording microphone · ${seconds}s / 175s · stop when finished.`);if(seconds>=175&&recorder.state==='recording')recorder.stop();};
    tick();s.timer=setInterval(tick,1000);
    stream.getAudioTracks()[0].onended=()=>{if(recorder.state==='recording')recorder.stop();};
  }catch(e){if(voice.session===s){releaseMic(s);voiceStatus(e.name==='NotAllowedError'?'Microphone permission was denied. Allow it in your browser, then discard and try again.':e.message);}}
}
function installDictationButtons(){
  for(const target of document.querySelectorAll('#reviewPanel textarea:not([data-no-dictation])')){
    if(target.dataset.dictation)continue;target.dataset.dictation='1';
    const title=target.closest('label')?.firstChild?.textContent?.trim()||'annotation';
    const button=el('button','Dictate',{type:'button',className:'secondary voice-start'});button.setAttribute('aria-label','Dictate '+title);
    button.onclick=guard(()=>startVoice(target));target.closest('label').after(button);
  }
}
$('voiceStop').onclick=()=>{const s=voice.session;if(s?.recorder?.state==='recording')s.recorder.stop();};
$('voiceDiscard').onclick=discardVoice;$('voiceRetry').onclick=transcribeVoice;
$('voicePreview').oninput=()=>{$('voiceInsert').disabled=!$('voicePreview').value.trim();};
$('voiceInsert').onclick=guard(()=>{
  const s=voice.session,text=$('voicePreview').value.trim();if(!s||!text)return;
  if(!s.target.isConnected||s.context!==voiceContext()||s.target.disabled)throw new Error('The original annotation changed. Copy this transcript before discarding it; it will not be inserted into a different review.');
  s.target.value=[s.target.value.trimEnd(),text].filter(Boolean).join('\n');s.target.dispatchEvent(new Event('input',{bubbles:true}));
  const target=s.target;discardVoice();target.focus();message('Voice transcript inserted. Review the text; it autosaves as a draft.');
});
new MutationObserver(installDictationButtons).observe($('reviewPanel'),{childList:true,subtree:true});installDictationButtons();
window.addEventListener('beforeunload',e=>{if(voice.session){e.preventDefault();e.returnValue='';}});
