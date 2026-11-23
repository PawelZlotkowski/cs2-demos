'use strict';
const clipFlow={summary:null,items:[],queue:[],recorder:null,active:null,dirty:false,revision:null,timer:null,saving:Promise.resolve(),nav:0,conflict:false,verifying:null,advancing:false,signalRatings:{}};
function batchKey(){return [state.demo,state.player,state.labeller].join('/');}
function batchPath(){return `/api/demos/${state.demo}/players/${state.player}/clip-batch`;}
function clipQuery(){return `?labeller=${encodeURIComponent(state.labeller)}`;}
function renderCoachEligibility(demo){
  const partition=demo?.provenance.split;
  const heldOut=partition==='val'||partition==='test';
  $('useCoachExamples').disabled=!demo||heldOut;
  $('useCoachExamples').checked=partition==='train'&&demo.provenance.trainingPermitted;
  $('coachEligibility').textContent=!demo?'':heldOut?'Reserved for evaluation.':partition==='unassigned'?'Enabling this assigns the demo to the training set.':'Completed notes are available to the local coach when enabled.';
}
$('useCoachExamples').onchange=guard(async()=>{
  const demo=state.demos.find(d=>d.id===state.demo);
  if(!demo)return;
  const enabled=$('useCoachExamples').checked;
  $('useCoachExamples').disabled=true;
  try{
    const updated=await api(`/api/demos/${demo.id}/provenance`,{method:'PUT',body:JSON.stringify({
      ...demo.provenance,split:enabled?'train':demo.provenance.split,trainingPermitted:enabled})});
    demo.provenance=updated.provenance;
    if(state.demo===demo.id){
      $('split').value=updated.provenance.split;
      $('trainingPermitted').checked=updated.provenance.trainingPermitted;
      message(enabled?'Local coach examples enabled for this demo.':'Local coach examples disabled for this demo.');
    }
  }finally{if(state.demo===demo.id)renderCoachEligibility(demo);}
});
function closeClipReview(){if(clipFlow.active){try{localStorage.removeItem('rr.annotation.clip');}catch{}}clipFlow.nav++;clipFlow.active=null;clipFlow.dirty=false;clearTimeout(clipFlow.timer);$('clipLabelPanel').hidden=true;document.body.classList.remove('clip-review','clip-setup-open');$('showClipSetup').hidden=true;$('showClipSetup').textContent='Change demo / player';$('radarPane').open=true;$('clipSelect').disabled=false;}
function resetClipFlow(){closeClipReview();clipFlow.summary=null;clipFlow.items=[];clipFlow.queue=[];$('batchProgress').textContent='Prepare a player to record detected moments.';$('batchItems').replaceChildren();delete $('batchItems').dataset.version;$('batchMeter').hidden=true;$('recorderStatus').textContent='';renderBatchButtons();}
function rememberClip(){try{localStorage.setItem('rr.annotation.clip',JSON.stringify({key:batchKey(),batch:clipFlow.summary.id,clip:clipFlow.active.id}));}catch{}}
function renderBatchButtons(){const s=clipFlow.summary;$('recordAll').disabled=!state.replay||s?.stale;$('reviewClips').disabled=!s?.total||s?.stale;$('pauseBatch').disabled=!s||s.stale;$('pauseBatch').textContent=s?.paused?'Resume recordings':'Pause recordings';$('retryBatch').disabled=!s?.counts.failed||s?.stale;}
function renderBatch(){
  const s=clipFlow.summary;renderBatchButtons();if(!s){$('batchProgress').textContent='No recording batch yet.';return;}
  $('batchProgress').textContent=s.stale?'These clips use older rules. Choose Prepare player to recalculate before reviewing. Your earlier notes remain in history.':s.total?`${s.counts.ready||0}/${s.total} clips ready · ${s.counts.recording||0} in recording session · ${s.counts.queued||0} queued · ${s.counts.failed||0} failed · ${s.completed}/${s.total} labelled${s.paused?' · paused':''}. Context: ${s.before}s before / ${s.after}s after.`:'No detected moments for this player in the current snapshot.';
  $('batchMeter').hidden=!s.total;$('batchMeter').max=s.total||1;$('batchMeter').value=s.counts.ready||0;
  const worker=clipFlow.recorder,active=worker?.active;
  let status=worker?.connected?'Recorder connected.':'Recorder offline — no recent heartbeat. Start the host recorder on the PC with Steam and CS2.';
  if(s.total&&s.counts.ready===s.total)status='All footage is ready. You can label clips without running the recorder.';
  if(s.paused)status+=' This batch is paused; any active recording session will finish. Click Resume recordings for pending clips.';
  else if(active){const own=active.batchId===s.id,index=clipFlow.queue.findIndex(c=>c.id===active.id);status+=own?` ${active.sessionSize>1?`Session of ${active.sessionSize} clips`:`Clip ${index+1} of ${s.total}`}: ${stageText(active)}.`:' Processing a clip from another batch first.';if(!worker?.connected)status+=' The in-progress recording may be interrupted; its lease must expire before retrying.';}
  else if(worker?.connected&&s.counts.queued)status+=' Waiting for the next queued clip to be claimed.';
  else if(worker?.connected&&!s.counts.queued)status+=' No pending recordings in this batch.';
  $('recorderStatus').textContent=status;$('recorderHelp').hidden=!!worker?.connected;
  const box=$('batchItems');
  const version=JSON.stringify([clipFlow.queue,clipFlow.items.map(c=>c.label?.status),clipFlow.active?.id,s.paused,worker?.connected]);
  if(box.dataset.version===version)return;
  box.dataset.version=version;
  const focused=box.contains(document.activeElement)?document.activeElement.dataset.clip:null;
  box.replaceChildren();
  for(const [i,c] of clipFlow.queue.entries()){
    const label=clipFlow.items.find(item=>item.id===c.id)?.label;
    const b=el('button',`${i+1}. R${c.round} · ${c.start.toFixed(1)}–${c.end.toFixed(1)}s · ${label?.status==='complete'?'labelled':c.state==='queued'?(s.paused?'paused':worker?.connected?'queued':'waiting for recorder'):c.state==='recording'?(c.sessionSize>1&&c.stage==='capturing'?'in capture session':stageText(c)):c.state}`,{className:c.id===clipFlow.active?.id?'active':''});
    b.dataset.clip=c.id;b.onclick=guard(()=>reviewQueuedClip(c.id));box.append(b);if(c.id===focused)b.focus({preventScroll:true});
    if(c.state==='failed')box.append(el('p',c.error||'Recording was interrupted or its lease expired. Use Retry failed recordings.',{className:'notice'}));
  }
}
function stageText(c){if(c.stage==='capturing'&&c.captureWindows)return c.captureWindow?`capturing window ${c.captureWindow} of ${c.captureWindows}; clips become ready after capture finishes`:`starting CS2 for ${c.captureWindows} windows`;return ({preparing:'preparing demo',analysing:'analysing demo',capturing:'capturing session in CS2; clips become ready after capture finishes',encoding:'preparing individual videos',uploading:'uploading video'})[c.stage]||'recording';}
async function reviewQueuedClip(id){await leave();const key=batchKey(),batch=clipFlow.summary.id;const items=await api(`/api/clip-batches/${batch}/review`+clipQuery(),{method:'POST'});if(key!==batchKey()||batch!==clipFlow.summary?.id)return;clipFlow.items=items;await openBatchClip(id);}
async function refreshBatch(){
  if(!state.demo||!state.player||!state.labeller)return;const key=batchKey();
  const path=clipFlow.active?`/api/clip-batches/${clipFlow.summary.id}`:batchPath();
  const summary=await api(path+clipQuery());if(key!==batchKey())return;
  clipFlow.summary=summary;
  if(summary){
    const [queue,recorder]=await Promise.all([api(`/api/clip-batches/${summary.id}/queue`),api('/api/recordings/status')]);
    if(key!==batchKey()||summary.id!==clipFlow.summary?.id)return;
    clipFlow.queue=queue;clipFlow.recorder=recorder;
  }else{clipFlow.queue=[];$('batchMeter').hidden=true;$('recorderStatus').textContent='';}
  if(clipFlow.active&&summary){
    const updated=clipFlow.queue.find(c=>c.id===clipFlow.active?.id);
    if(updated){
      const becameReady=updated.state==='ready'&&clipFlow.active.state!=='ready';
      Object.assign(clipFlow.active,updated);
      if(becameReady){await refreshFootage();if(key===batchKey()&&clipFlow.active?.id===updated.id){selectClip(updated.id);seekReplay(updated.start);}}
      renderActiveClip(false);
    }
  }
  renderBatch();
}
async function startBatch(){
  validName();if(!state.replay)throw new Error('Prepare the selected player first.');await leave();const key=batchKey();
  const summary=await api(batchPath(),{method:'POST',body:JSON.stringify({before:Number($('batchBefore').value),after:Number($('batchAfter').value)})});
  if(key!==batchKey())return;closeClipReview();clipFlow.summary=summary;clipFlow.items=[];
  if(summary.paused)await api(`/api/clip-batches/${summary.id}`,{method:'PUT',body:JSON.stringify({paused:false})});
  await refreshBatch();$('batchQueue').open=true;$('recordingControls').open=true;
  message(summary.total?`${summary.total} detected moments queued. Existing clips are reused. See recorder status and individual clip progress below.`:'No detected moments for this player.');
}
async function reviewBatch(){
  validName();await leave();await refreshBatch();if(!clipFlow.summary?.total)return;
  const key=batchKey(),id=clipFlow.summary.id;
  const items=await api(`/api/clip-batches/${id}/review`+clipQuery(),{method:'POST'});if(key!==batchKey()||id!==clipFlow.summary?.id)return;
  clipFlow.items=items;const target=items.find(c=>c.state==='ready'&&c.label?.status!=='complete')||items.find(c=>c.label?.status!=='complete')||items[0];
  if(target)await openBatchClip(target.id);
}
async function openBatchClip(id){
  await leave();const c=clipFlow.items.find(c=>c.id===id);if(!c)return;
  // A saved batch can appear before Prepare/resume has loaded the round list.
  const selection=batchKey();
  if(!state.rounds.some(r=>r.number===c.round))await loadRounds(c.round);
  if(selection!==batchKey())return;
  const key=batchKey(),nav=++clipFlow.nav;clipFlow.active=null;$('clipLabelPanel').hidden=true;
  await loadRound(c.round,true);if(key!==batchKey()||nav!==clipFlow.nav||state.round!==c.round)return;
  clipFlow.active=c;clipFlow.revision=c.label?.revision??null;clipFlow.dirty=false;clipFlow.conflict=false;
  document.body.classList.add('clip-review');$('clipLabelPanel').hidden=false;$('showClipSetup').hidden=false;$('radarPane').open=false;$('clipSelect').disabled=true;$('batchQueue').open=false;$('recordingControls').open=false;$('clipError').hidden=true;message();
  $('before').value=clipFlow.summary.before;$('after').value=clipFlow.summary.after;
  $('windowStart').value=c.start;$('windowEnd').value=c.end;$('loopWindow').checked=true;
  playback.window={start:c.start,anchor:c.anchor,end:c.end};
  $('contextInfo').textContent=`Decision ${c.anchor.toFixed(2)}s · recorded context ${c.start.toFixed(2)}–${c.end.toFixed(2)}s`;
  await refreshFootage();if(key!==batchKey()||nav!==clipFlow.nav)return;
  if(c.state==='ready')selectClip(c.id);seekReplay(c.start);
  renderActiveClip(true);renderBatch();rememberClip();$('clipHeading').focus({preventScroll:true});$('replayStage').scrollIntoView({block:'start'});
}
function renderActiveClip(loadFields){
  const c=clipFlow.active;if(!c)return;const index=clipFlow.items.findIndex(v=>v.id===c.id);
  $('clipHeading').textContent=`Clip ${index+1} of ${clipFlow.items.length} · round ${c.round}`;
  const findings=c.findings||[c.finding];
  $('clipSignal').textContent=findings.map(f=>`${(f.t-c.start).toFixed(1)} s: ${f.summary||f.detector}`).join('; ');
  $('clipEvidence').textContent=JSON.stringify(findings.length===1?findings[0].evidence:findings.map(f=>({id:f.id,detector:f.detector,secondsIntoClip:f.t-c.start,evidence:f.evidence})),null,2);
  $('clipVerdictLabel').textContent='Detection signal';
  $('clipVerdictLabel').hidden=$('clipVerdict').hidden=findings.length>1;
  $('clipRecordingState').textContent=c.state==='ready'?'':`Recording ${c.state}. ${c.error||'You can use the radar while waiting.'}`;
  const player=state.demos.find(d=>d.id===state.demo)?.players?.find(p=>p.id===state.player)?.name||state.player;
  $('clipVerifyHelp').textContent=`${player} · decision ${(c.anchor-c.start).toFixed(1)} s into the clip`;
  $('watchLabelClip').disabled=c.state!=='ready';
  for(const id of ['clipVerdict','clipAssessment','clipNotes','clipLanguage','clipQuality','clipSelectionVerdict','saveClipNext','saveClipDraft'])$(id).disabled=c.state!=='ready';
  $('previousClip').disabled=index<=0;$('nextClip').disabled=index>=clipFlow.items.length-1;
  if(loadFields){
    clipFlow.signalRatings=Object.fromEntries((c.label?.signalReviews||[]).map(r=>[r.findingId,r.verdict]));
    $('clipQuality').value=c.label?.footageStatus||'';
    $('clipSelectionVerdict').value=c.label?.selectionVerdict||'';
    $('clipSignalReviews').replaceChildren();
    if(findings.length>1)for(const f of findings){
      const row=el('label',`${(f.t-c.start).toFixed(1)} s · ${f.summary||f.detector}`);
      const select=el('select',null,{disabled:c.state!=='ready'});
      for(const [value,text] of [['','Unrated'],['correct','Correct detection'],['wrong','Wrong detection'],['unsure','Unsure']])select.append(el('option',text,{value}));
      select.value=clipFlow.signalRatings[f.id]||'';
      select.oninput=()=>{clipFlow.signalRatings[f.id]=select.value;markClipDirty();};
      row.append(select);$('clipSignalReviews').append(row);
    }
    $('clipVerdict').value=c.label?.verdict||'';$('clipAssessment').value=c.label?.assessment||'';
    $('clipNotes').value=c.label?.notes||'';$('clipLanguage').value=c.label?.language||$('clipLanguage').value||'en';
    $('clipSaveState').textContent=c.label?(c.label.status==='complete'?'Saved note':'Draft restored'):'';
  }
  renderClipRequirements();
}
function clipPayload(status){
  const findings=clipFlow.active?.findings||[clipFlow.active?.finding];
  const issue=$('clipQuality').value&&$('clipQuality').value!=='verified';
  const signalReviews=findings.filter(f=>f?.id).map(f=>({findingId:f.id,verdict:findings.length===1?$('clipVerdict').value:clipFlow.signalRatings[f.id]})).filter(r=>r.verdict);
  return {previousRevision:clipFlow.revision,status,
    inputMode:!issue&&$('clipAssessment').value&&(findings.length===1?$('clipVerdict').value:signalReviews.length===findings.length)?'structured':'note',
    confirmFootage:status==='complete'&&$('clipQuality').value==='verified',footageStatus:$('clipQuality').value||null,
    selectionVerdict:issue?'unsure':$('clipSelectionVerdict').value||null,
    signalReviews:issue?[]:signalReviews,verdict:!issue&&findings.length===1?$('clipVerdict').value||null:null,
    assessment:issue?'uncertain':$('clipAssessment').value||null,notes:$('clipNotes').value,language:$('clipLanguage').value};}
function markClipDirty(){clipFlow.dirty=true;$('clipError').hidden=true;renderClipRequirements();$('clipSaveState').textContent='Unsaved clip label';clearTimeout(clipFlow.timer);clipFlow.timer=setTimeout(()=>saveClipLabel('draft').catch(e=>message(e.message)),900);}
async function saveClipLabel(status='draft',force=false){
  clearTimeout(clipFlow.timer);
  clipFlow.saving=clipFlow.saving.catch(()=>{}).then(async()=>{
    if(!clipFlow.active||(!clipFlow.dirty&&!force))return;
    if(clipFlow.conflict)throw new Error('Reload this clip label to resolve the save conflict. Copy unsaved notes first.');
    if(status==='complete'){const missing=clipMissing();if(missing.length){showClipError('Still needed: '+missing.map(m=>m[1]).join('; ')+'.');$(missing[0][0]).focus();if(clipFlow.dirty)clipFlow.timer=setTimeout(()=>saveClipLabel('draft').catch(e=>showClipError(e.message)),900);throw new Error($('clipError').textContent);}}
    const c=clipFlow.active,key=batchKey(),batch=clipFlow.summary.id,payload=clipPayload(status),body=JSON.stringify(payload);
    $('clipSaveState').textContent='Saving clip label…';
    try{
      const label=await api(`/api/clip-batches/${batch}/clips/${c.id}/label`+clipQuery(),{method:'PUT',body});
      if(key!==batchKey()||clipFlow.active?.id!==c.id)return;
      const unchanged=JSON.stringify(clipPayload(status))===body;
      clipFlow.revision=label.revision;clipFlow.active.label=label;
      if(label.footage?.alignmentConfirmed)clipFlow.active.alignmentConfirmed=true;
      const item=clipFlow.items.find(v=>v.id===c.id);if(item)item.label=label;
      clipFlow.dirty=!unchanged;$('clipSaveState').textContent=unchanged?(label.status==='complete'?'Note saved':'Draft saved'):'More changes waiting to save';
      renderBatch();if(clipFlow.dirty)clipFlow.timer=setTimeout(()=>saveClipLabel().catch(e=>message(e.message)),300);
    }catch(e){if(e.status===409)clipFlow.conflict=true;$('clipSaveState').textContent='Clip label not saved';showClipError(e.message);throw e;}
  });
  return clipFlow.saving;
}
async function leaveClip(){await saveClipLabel();if(clipFlow.dirty)await saveClipLabel();}
function clipMissing(){
  const missing=[];
  if(!$('clipQuality').value)missing.push(['clipQuality','check the player, timing and context, or report a footage problem']);
  if($('clipQuality').value==='verified'&&!$('clipSelectionVerdict').value)missing.push(['clipSelectionVerdict','say whether this moment was worth selecting']);
  if(!$('clipNotes').value.trim()&&clipPayload('complete').inputMode!=='structured')missing.push(['clipNotes','write a note or rate every detection and the decision']);
  return missing;
}
function renderClipRequirements(){
  const missing=clipMissing();
  $('clipRequirements').textContent='Check footage first. A footage problem is saved for repair and excluded from training examples.';
  $('clipNotes').setAttribute('aria-invalid',String(!$('clipError').hidden&&missing.length>0));
  $('saveClipNext').disabled=clipFlow.active?.state!=='ready'||clipFlow.advancing;
  const index=clipFlow.items.findIndex(c=>c.id===clipFlow.active?.id);
  $('previousClip').disabled=index<=0||clipFlow.advancing;
  $('nextClip').disabled=index<0||index>=clipFlow.items.length-1||clipFlow.advancing;
  $('saveClipDraft').disabled=clipFlow.active?.state!=='ready'||clipFlow.advancing;
}
function showClipError(text){$('clipError').textContent=text;$('clipError').hidden=false;renderClipRequirements();}
function clipGuard(fn){return guard(async(...args)=>{try{await fn(...args);}catch(e){showClipError(e.message);throw e;}});}
async function confirmClipFootage(id){
  const key=batchKey();clipFlow.verifying=id;if(clipFlow.active?.id===id)renderActiveClip(false);
  try{
    const confirmed=await api(`/api/footage/${id}/confirm`,{method:'POST'});
    if(key!==batchKey())return;
    if(playback.clip?.id===id){Object.assign(playback.clip,confirmed);showClipInfo();}
    for(const collection of [playback.clips,clipFlow.items,clipFlow.queue]){const c=collection.find(c=>c.id===id);if(c)Object.assign(c,confirmed);}
    if(clipFlow.active?.id===id){Object.assign(clipFlow.active,confirmed);$('clipError').hidden=true;}
  }finally{clipFlow.verifying=null;if(clipFlow.active?.id===id)renderActiveClip(false);}
}
async function nextReadyClip(){
  if(clipFlow.advancing)return;
  clipFlow.advancing=true;renderClipRequirements();
  try{
    leaveVoice();
    const saved=clipFlow.active?.label;
    if(clipFlow.dirty||saved?.status!=='complete'||saved.footage?.id!==clipFlow.active.id)await saveClipLabel('complete',true);
    if(clipFlow.dirty)throw new Error('The label changed during saving. Save it again before moving on.');
    const key=batchKey(),batch=clipFlow.summary.id,current=clipFlow.active.id;
    const items=await api(`/api/clip-batches/${batch}/review`+clipQuery(),{method:'POST'});
    if(key!==batchKey()||batch!==clipFlow.summary?.id||current!==clipFlow.active?.id)return;
    clipFlow.items=items;
    const index=clipFlow.items.findIndex(c=>c.id===clipFlow.active?.id);
    const ordered=[...clipFlow.items.slice(index+1),...clipFlow.items.slice(0,index)];
    const next=ordered.find(c=>c.state==='ready'&&c.label?.status!=='complete');
    if(next)await openBatchClip(next.id);else{
      const text=ordered.some(c=>c.label?.status!=='complete')?'Saved. No other unfinished clips in this batch are ready yet.':'Saved. All clips in this batch are labelled.';
      $('clipSaveState').textContent=text;message(text);
    }
  }finally{clipFlow.advancing=false;renderClipRequirements();}
}

async function resumeClipLocation(){
  const saved=safeRead('rr.annotation.clip');if(saved?.key!==batchKey())return;
  await refreshBatch();if(clipFlow.summary?.id!==saved.batch)return;
  clipFlow.items=await api(`/api/clip-batches/${saved.batch}/review`+clipQuery(),{method:'POST'});
  if(clipFlow.items.some(c=>c.id===saved.clip))await openBatchClip(saved.clip);
}
$('recordAll').onclick=guard(startBatch);$('reviewClips').onclick=guard(reviewBatch);
$('openReadyClip').onclick=guard(async()=>{
  if(!$('labeller').value.trim()){$('labeller').focus();throw new Error('Enter your name so you can resume your notes.');}
  validName();
  $('openReadyClip').disabled=true;
  try{
    const ready=await api('/api/next-ready-clip'+clipQuery());
    if(!ready){$('readyHint').textContent='No unreviewed clips are ready. Choose a demo and player to check recordings.';return;}
    await leave();
    clearReview();
    state.demo=ready.demo;state.player=ready.player;
    await refreshDemos();setDemo();remember();
    await refreshBatch();
    if(!clipFlow.summary)throw new Error('The recording batch changed. Open a ready clip again.');
    await reviewQueuedClip(ready.clip);
  }finally{$('openReadyClip').disabled=false;}
});
$('pauseBatch').onclick=guard(async()=>{if(!clipFlow.summary)return;await api(`/api/clip-batches/${clipFlow.summary.id}`,{method:'PUT',body:JSON.stringify({paused:!clipFlow.summary.paused})});await refreshBatch();});
$('retryBatch').onclick=guard(async()=>{await api(`/api/clip-batches/${clipFlow.summary.id}/retry-failed`,{method:'POST'});await refreshBatch();});
for(const id of ['clipVerdict','clipAssessment','clipNotes','clipLanguage','clipQuality','clipSelectionVerdict'])$(id).oninput=markClipDirty;
$('saveClipDraft').onclick=clipGuard(()=>saveClipLabel('draft',true));$('saveClipNext').onclick=clipGuard(nextReadyClip);
$('watchLabelClip').onclick=clipGuard(async()=>{const c=clipFlow.active;if(c?.state==='ready'){selectClip(c.id);seekReplay(c.start);await playReplay();}});
$('showClipSetup').onclick=()=>{const open=document.body.classList.toggle('clip-setup-open');$('showClipSetup').textContent=open?'Hide setup':'Change demo / player';};
for(const [id,step] of [['previousClip',-1],['nextClip',1]])$(id).onclick=clipGuard(async()=>{const index=clipFlow.items.findIndex(c=>c.id===clipFlow.active?.id);const next=clipFlow.items[index+step];if(next)await openBatchClip(next.id);});
$('reloadClip').onclick=guard(async()=>{if(clipFlow.dirty&&!confirm('Discard unsaved clip edits and reload the saved label?'))return;clearTimeout(clipFlow.timer);await clipFlow.saving.catch(()=>{});clipFlow.dirty=false;clipFlow.conflict=false;await reviewQueuedClip(clipFlow.active.id);});
$('returnRound').onclick=guard(async()=>{await leave();closeClipReview();try{localStorage.removeItem('rr.annotation.clip');}catch{}message('Detector candidates were shown. Subsequent round reviews for exposed rounds are marked candidate-exposed.');});
for(const [id,training] of [['exportClips',false],['exportTrainingClips',true]])$(id).onclick=guard(async()=>{
  validName();await leave();
  const params=new URLSearchParams({labeller:state.labeller,training:String(training)});
  if(!training&&$('exportSplit').value)params.set('split',$('exportSplit').value);
  window.location.assign('/api/clip-labels/export?'+params);
});
window.addEventListener('beforeunload',e=>{if(clipFlow.dirty){e.preventDefault();e.returnValue='';}});
