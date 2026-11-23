'use strict';
const $ = id => document.getElementById(id);
const state = {demos: [], demo: '', player: '', round: null, rounds: [], progress: {}, revision: null,
  independent: false, moments: [], candidates: {}, findings: [], replay: null, dirty: false,
  conflict: false, timer: null, saving: Promise.resolve(), generation: 0, labeller: '', pending: null};
const categories = ['shooting','utility','teamwork','positioning','objective','economy','other'];
const safeRead = key => { try { return JSON.parse(localStorage.getItem(key)); } catch { return null; } };
const remember = () => { try { localStorage.setItem('rr.annotation.location', JSON.stringify({labeller: state.labeller,demo:state.demo,player:state.player,round:state.round,pending:state.pending})); } catch {} };
function el(tag, text, props={}) { const n=document.createElement(tag); if(text!==null)n.textContent=text; Object.assign(n,props); return n; }
function message(text='') { $('message').textContent=text; $('message').hidden=!text; }
function errorText(detail) { return typeof detail==='string'?detail:JSON.stringify(detail); }
async function api(path, options={}) {
  const r=await fetch(path,{...options,headers:{'X-Annotation-Request':'1',...(options.body?{'Content-Type':'application/json'}:{}),...options.headers}});
  if(!r.ok){let d;try{d=await r.json();}catch{d={detail:r.statusText};} const err=new Error(errorText(d.detail));err.status=r.status;throw err;}
  return r.json();
}
function guard(fn){return async(...args)=>{try{message();await fn(...args);}catch(e){message(e.message);}};}
function reviewPath(){return `/api/demos/${state.demo}/players/${state.player}/rounds/${state.round}?labeller=${encodeURIComponent(state.labeller)}`;}
function validName(){if(!state.replay)state.labeller=$('labeller').value.trim();if(!/^[A-Za-z0-9_]{1,40}$/.test(state.labeller))throw new Error('Enter your labeller name using letters, digits or underscores.');}
function markDirty(){if(!state.replay)return;state.dirty=true;$('status').value='draft';$('saveState').textContent='Unsaved changes';clearTimeout(state.timer);state.timer=setTimeout(()=>save().catch(e=>message(e.message)),900);}
function payload(){return {previousRevision:state.revision,snapshotId:state.snapshotId,status:$('status').value,fullRoundReviewed:$('fullRoundReviewed').checked,
  independentComplete:state.independent,language:$('language').value,notes:$('notes').value,moments:state.moments,candidates:state.candidates};}
async function save(force=false){
  clearTimeout(state.timer);
  // Serialise saves so each uses the revision returned by the previous request.
  state.saving=state.saving.catch(()=>{}).then(async()=>{
    if(!state.replay||(!state.dirty&&!force))return;
    if(state.conflict)throw new Error('Save conflict: reload the saved review before continuing. Copy any unsaved text first.');
    const body=payload(), generation=state.generation, serialized=JSON.stringify(body);
    $('saveState').textContent='Saving…';
    try{
      const result=await api(reviewPath(),{method:'PUT',body:serialized});
      if(generation!==state.generation)return;
      const unchanged=JSON.stringify(payload())===serialized;
      state.revision=result.revision;
      state.progress[String(state.round)]={status:result.status,revision:result.revision};
      state.dirty=!unchanged;
      $('saveState').textContent=state.dirty?'Changes waiting to save':`Saved · ${new Date(result.savedAt).toLocaleTimeString()} · ${result.status}`;
      renderRounds();
      if(state.dirty){clearTimeout(state.timer);state.timer=setTimeout(()=>save().catch(e=>message(e.message)),400);}
    }catch(e){if(e.status===409)state.conflict=true;$('saveState').textContent='Not saved';throw e;}
  });
  return state.saving;
}
async function leave(){leaveVoice();await leaveClip();await save();if(state.dirty)await save();}
function optionList(node, items, value, placeholder){
  const options=placeholder?[['',placeholder],...items]:items;
  const unchanged=node.options.length===options.length&&options.every(([id,label],i)=>node.options[i].value===id&&node.options[i].textContent===label);
  if(!unchanged)node.replaceChildren(...options.map(([id,label])=>el('option',label,{value:id})));
  if(node.value!==value)node.value=value;
}
let demosRequest=0;
async function refreshDemos(){
  const request=++demosRequest,demos=await api('/api/demos');
  if(request!==demosRequest)return;
  state.demos=demos;
  optionList($('demo'),demos.map(d=>[d.id,`${d.map.replace('de_','')} · ${d.filename}`]),state.demo,'Choose an imported demo');
}
function setDemo(){
  const d=state.demos.find(d=>d.id===state.demo);
  optionList($('player'),(d?.players||[]).map(p=>[p.id,`${p.name} · ${p.id}`]),state.player,'Choose a player');
  $('parse').disabled=!d||!state.player;
  for(const k of ['source','sourceMatchId','split'])$(k).value=d?.provenance[k]??(k==='split'?'unassigned':'');
  $('trainingPermitted').checked=d?.provenance.trainingPermitted??false;
  if(typeof renderCoachEligibility==='function')renderCoachEligibility(d);
}
function clearReview(){resetClipFlow();resetReplay();state.generation++;state.replay=null;state.round=null;state.rounds=[];state.revision=null;state.dirty=false;state.conflict=false;$('parseState').textContent='';$('reviewPanel').hidden=true;$('welcome').hidden=false;$('rounds').replaceChildren();$('progress').textContent='Prepare a player to see rounds.';}
async function loadRounds(preferred=null){
  validName();const selection=[state.demo,state.player,state.labeller].join('/');
  const data=await api(`/api/demos/${state.demo}/players/${state.player}/rounds?labeller=${encodeURIComponent(state.labeller)}`);
  if(selection!==[state.demo,state.player,state.labeller].join('/'))return;
  state.rounds=data.rounds;state.progress=data.progress;state.policy=data.policy;
  const target=data.rounds.find(r=>r.number===preferred)||data.rounds.find(r=>data.progress[String(r.number)]?.status!=='complete')||data.rounds[0];
  if(target)await loadRound(target.number);$('parseState').textContent=data.stale?'Saved analysis uses older rules. Choose Prepare/resume to refresh it; earlier labels stay in history.':`Ready · ${state.rounds.length} rounds`;renderRounds();
}
function renderRounds(){
  const box=$('rounds');box.replaceChildren();let completed=0;
  for(const r of state.rounds){const status=state.progress[String(r.number)]?.status||'unreviewed';if(status==='complete')completed++;
    const b=el('button',`R${r.number} · ${status}`,{className:r.number===state.round?'active':''});b.onclick=guard(async()=>{await leave();await loadRound(r.number);});box.append(b);}
  $('progress').textContent=`${completed}/${state.rounds.length} completed · ${state.labeller}`;
}
async function loadRound(number,clipMode=false){
  leaveVoice();
  if(!clipMode)closeClipReview();
  resetReplay();clearTimeout(state.timer);state.round=number;const generation=++state.generation;
  state.replay=null;$('reviewPanel').hidden=true;$('saveState').textContent='Loading round…';
  const data=await api(reviewPath());if(generation!==state.generation)return;
  state.snapshotId=data.snapshotId;
  state.replay=data.replay;state.exposed=data.candidateExposed||false;state.revision=data.review?.revision??null;
  state.independent=data.review?.independentComplete??false;
  state.moments=(data.review?.moments||[]).map(({ticks,...m})=>m);state.candidates=data.review?.candidates||{};state.findings=data.candidates;
  state.dirty=false;state.conflict=false;
  $('notes').value=data.review?.notes||'';$('language').value=data.review?.language||'en';$('status').value=data.review?.status||'draft';$('fullRoundReviewed').checked=data.review?.fullRoundReviewed||false;
  $('anchor').value='0';$('anchor').max=String(data.replay.durationSec);
  const meta=state.rounds.find(r=>r.number===number);const demo=state.demos.find(d=>d.id===state.demo);const player=demo.players.find(p=>p.id===state.player);
  $('roundTitle').textContent=`Round ${number} · ${player.name}`;
  $('roundMeta').textContent=`${demo.map} · ${meta.side} · winner: ${meta.winner||'unknown'} · ${data.replay.durationSec.toFixed(1)} s · ticks ${data.replay.startTick}–${data.replay.endTick}${meta.knifeRound?' · knife round: normally exclude':''}`;
  $('context').textContent=JSON.stringify(data.context,null,2);
  $('saveState').textContent=data.review?`Resumed · revision ${data.review.revision} · ${data.review.status}`:'New review';
  $('reviewPanel').hidden=false;$('welcome').hidden=true;renderEvents();renderMoments();renderCandidates();renderRounds();openReplay(data.context);setAnchor(0);remember();
}
function setAnchor(t){pauseReplay();seekReplay(t);}
function renderEvents(){const box=$('events');box.replaceChildren();for(const event of state.replay.events){const b=el('button',`${event.t.toFixed(2)} s · ${event.label}`);b.onclick=()=>setAnchor(event.t);box.append(b);}}
function field(parent,label,value,onchange,{type='text',choices=null,rows=3}={}){const wrapper=el('label',label);let input;
  if(choices){input=el('select',null);for(const c of choices){const [id,name]=Array.isArray(c)?c:[c,c];input.append(el('option',name,{value:id}));}}
  else if(type==='textarea'){input=el('textarea',null,{rows});}else{input=el('input',null,{type});if(type==='number'){input.min='0';input.step='0.001';}}
  input.value=String(value??'');input.oninput=()=>{onchange(type==='number'?Number(input.value):input.value);markDirty();};wrapper.append(input);parent.append(wrapper);return input;}
function renderMoments(){const box=$('moments');box.replaceChildren();state.moments.forEach((m,index)=>{
  const card=el('div',null,{className:'moment'}),row=el('div',null,{className:'row'});row.append(el('h3',`Moment ${index+1}`));const remove=el('button','Remove',{className:'secondary'});remove.onclick=()=>{state.moments.splice(index,1);markDirty();renderMoments();};row.append(remove);card.append(row);const watch=el('button','Watch moment',{className:'secondary'});watch.onclick=()=>{watchContext(m.anchor);$('windowStart').value=m.start;$('windowEnd').value=m.end;seekReplay(m.start);};const attach=el('button',m.footageId?'Replace attached footage':'Attach selected footage',{className:'secondary'});attach.onclick=guard(()=>attachFootage(m));card.append(watch,attach);if(m.footageId){const unlink=el('button','Unlink footage',{className:'secondary'});unlink.onclick=()=>{m.footageId=null;markDirty();renderMoments();};card.append(el('p',`Footage evidence: ${m.footageId}`),unlink);}
  const times=el('div',null,{className:'grid'});for(const [key,title] of [['start','Start (s)'],['anchor','Decision (s)'],['end','End (s)']])field(times,title,m[key],v=>m[key]=v,{type:'number'});card.append(times);
  const choices=el('div',null,{className:'grid'});field(choices,'Assessment',m.assessment,v=>m.assessment=v,{choices:[['uncertain','Uncertain'],['mistake','Mistake'],['good','Good play'],['neutral','Neutral']]});field(choices,'Confidence',m.confidence,v=>m.confidence=v,{choices:['low','medium','high']});field(choices,'Learning priority',m.priority,v=>m.priority=Number(v),{choices:[['0','0 · none'],['1','1 · minor'],['2','2 · useful'],['3','3 · important']]});card.append(choices);
  const cats=el('div',null,{className:'grid'});for(const c of categories){const label=el('label',null,{className:'check'}),check=el('input',null,{type:'checkbox',checked:m.categories.includes(c)});check.onchange=()=>{m.categories=check.checked?[...m.categories,c]:m.categories.filter(x=>x!==c);markDirty();};label.append(check,document.createTextNode(c));cats.append(label);}card.append(cats);
  for(const [key,title] of [['facts','Observed facts'],['known','What the player knew'],['unknown','Unknown / missing evidence'],['reason','Why this assessment?'],['alternative','Feasible alternative / habit']])field(card,title,m[key],v=>m[key]=v,{type:'textarea',rows:2});
  const refs=el('label','Supporting event references (Ctrl/Cmd to select several)'),select=el('select',null,{multiple:true,size:4});for(const e of state.replay.events)select.append(el('option',`${e.t.toFixed(1)} s · ${e.label}`,{value:e.id,selected:m.evidence.includes(e.id)}));select.onchange=()=>{m.evidence=[...select.selectedOptions].map(o=>o.value);markDirty();};refs.append(select);card.append(refs);
  if(state.independent)field(card,'Missed by an enabled detector (optional)',m.missedDetector||'',v=>m.missedDetector=v||null,{choices:[['','Not a missed detector event'],...state.policy.detectors.map(d=>[d,d.replaceAll('_',' ')])]});
  box.append(card);
});}
function renderCandidates(){
  $('candidatePanel').hidden=!state.independent;$('reveal').disabled=state.independent;$('reveal').textContent=state.exposed?'Save round pass & reveal candidates':'Save independent pass & reveal candidates';
  $('independentState').textContent=state.independent?'Independent pass preserved. Suggestions have been revealed.':'Detector suggestions remain hidden until you finish the independent pass.';
  if(state.exposed)$('independentState').textContent='You have seen detector candidates for this round. Further round reviews are marked candidate-exposed; any earlier independent pass remains preserved.';
  const box=$('candidates');box.replaceChildren();
  if(state.independent&&!state.findings.length)box.append(el('p','No candidates in this round. You can still record good plays, mistakes, uncertainty or a completed review with no moments.'));
  for(const f of state.findings){const card=el('div',null,{className:'candidate'});card.append(el('h3',`${f.id} · ${f.detector.replaceAll('_',' ')} · ${f.t.toFixed(2)} s`));
    card.append(el('p',`Signal / subtype: ${f.template||f.detector}`));
    const evidence=el('pre',JSON.stringify(f.evidence,null,2));card.append(evidence);
    const note=el('p',f.summary);note.className='notice';card.append(note,el('p','The generated wording above is a candidate, not ground truth. Judge the signal and write your own decision assessment.'));
    const wrapper=el('label','Signal verdict'),select=el('select',null);for(const [v,t] of [['','Choose…'],['correct','Correct'],['wrong','Wrong'],['unsure','Unsure']])select.append(el('option',t,{value:v}));select.value=state.candidates[f.id]?.verdict||'';
    select.onchange=()=>{if(select.value)state.candidates[f.id]={verdict:select.value,note:state.candidates[f.id]?.note||''};else delete state.candidates[f.id];markDirty();};wrapper.append(select);card.append(wrapper);
    field(card,'Verdict note',state.candidates[f.id]?.note||'',v=>{if(state.candidates[f.id])state.candidates[f.id].note=v;else{state.candidates[f.id]={verdict:'unsure',note:v};select.value='unsure';}},{type:'textarea',rows:2});
    const seek=el('button','Watch context',{className:'secondary'});seek.onclick=()=>watchContext(f.t);const record=el('button','Record context',{className:'secondary'});record.onclick=guard(()=>recordContext(f.t));const mark=el('button','Label this decision',{className:'secondary'});mark.onclick=()=>addMoment(f.t);card.append(seek,record,mark);box.append(card);
  }
}
let polling=null,renderedJobs='',savedLocation=null;
function poll(){
  if(!polling)polling=refreshStatus().finally(()=>{polling=null;});
  return polling;
}
function renderJobs(list){
  const box=$('jobs');
  const active=list.filter(j=>['queued','running'].includes(j.state)).length;
  $('jobsSummary').textContent=`Import and parsing history · ${active} active`;
  const signature=JSON.stringify(list.slice(0,8).map(j=>[j.id,j.state,j.error,j.payload.filename]));
  if(renderedJobs===signature)return;
  renderedJobs=signature;box.replaceChildren();
  for(const j of list.slice(0,8)){const card=el('div',null,{className:'job'});card.append(el('strong',`${j.kind==='inspect'?'Import':'Parse'} · ${j.state}`),el('div',j.payload.filename||state.demos.find(d=>d.id===j.payload.demo)?.filename||j.payload.demo));if(j.error)card.append(el('p',j.error));
    if(['failed','cancelled'].includes(j.state)){const b=el('button','Retry');b.onclick=guard(async()=>{await api(`/api/jobs/${j.id}/retry`,{method:'POST'});if(j.kind==='parse'&&j.payload.demo===state.demo&&j.payload.player===state.player){state.pending={id:j.id,demo:state.demo,player:state.player};remember();}await poll();});card.append(b);}
    if(['queued','running'].includes(j.state)){const b=el('button','Cancel',{className:'secondary'});b.onclick=guard(async()=>{await api(`/api/jobs/${j.id}/cancel`,{method:'POST'});});card.append(b);}box.append(card);}
}
async function resumeLocation(){
  const saved=savedLocation;
  if(!saved)return;
  const demo=state.demos.find(d=>d.id===saved.demo);
  if(!demo){savedLocation=null;return;}
  state.demo=demo.id;state.player=demo.players.some(p=>p.id===saved.player)?saved.player:'';
  if(saved.pending?.demo===state.demo&&saved.pending.player===state.player)state.pending=saved.pending;
  setDemo();$('demo').value=state.demo;
  if(state.player&&state.labeller){
    try{
      if(!state.replay)await loadRounds(saved.round);
      if(savedLocation===saved)await resumeClipLocation();
    }catch(e){if(e.status!==409)throw e;}
  }
  if(savedLocation===saved)savedLocation=null;
}
async function refreshStatus(){
  const list=await api('/api/jobs');
  await refreshDemos();
  renderJobs(list);
  await resumeLocation();
  await refreshBatch();
  if($('saveState').textContent.startsWith('Server unavailable'))$('saveState').textContent=state.dirty?'Unsaved changes':state.revision?`Saved · revision ${state.revision}`:'Server ready';
  if(state.pending){const j=list.find(j=>j.id===state.pending.id);if(j?.state==='complete'){
      const p=state.pending;if(state.demo===p.demo&&state.player===p.player&&!state.replay)await loadRounds();
      if(state.pending===p){state.pending=null;remember();}
    }else if(j&&['failed','cancelled'].includes(j.state)){$('parseState').textContent=j.error||j.state;state.pending=null;remember();}}
}
function upload(file){return new Promise((resolve,reject)=>{const xhr=new XMLHttpRequest();xhr.open('POST','/api/import');xhr.setRequestHeader('X-Annotation-Request','1');xhr.setRequestHeader('X-Filename',encodeURIComponent(file.name));xhr.setRequestHeader('Content-Type','application/octet-stream');xhr.upload.onprogress=e=>{$('uploadState').textContent=`Uploading ${file.name} · ${e.lengthComputable?Math.round(e.loaded/e.total*100)+'%':'…'}`;};xhr.onload=()=>{let data;try{data=JSON.parse(xhr.responseText);}catch{data={detail:xhr.statusText};}if(xhr.status>=200&&xhr.status<300)resolve(data);else reject(new Error(errorText(data.detail)));};xhr.onerror=()=>reject(new Error('Upload interrupted. Check the local server and try again.'));xhr.send(file);});}
async function importFiles(files){validName();const demos=[...files].filter(f=>/\.dem(\.zst)?$/i.test(f.name));if(!demos.length)throw new Error('No .dem or .dem.zst files selected.');const failures=[];for(const f of demos){try{await upload(f);}catch(e){failures.push(`${f.name}: ${e.message}`);}}$('uploadState').textContent=`${demos.length-failures.length} file(s) queued. Roster inspection runs before full parsing.`;if(failures.length)message(failures.join('\n'));await poll();}
for(const id of ['files','folder'])$(id).onchange=guard(async e=>{
  const files=[...e.target.files];e.target.value='';
  if(files.length)await importFiles(files);
});
$('useName').onclick=guard(async()=>{
  const name=$('labeller').value.trim();
  if(!/^[A-Za-z0-9_]{1,40}$/.test(name))throw new Error('Use 1–40 letters, digits or underscores.');
  try{await leave();}catch(e){$('labeller').value=state.labeller;throw e;}
  savedLocation=null;resetClipFlow();state.labeller=name;remember();
  $('saveState').textContent=`Labelling as ${name}`;
  if(state.demo&&state.player){try{await loadRounds(state.round);}catch(e){if(e.status!==409)throw e;}}
});
async function changeSelection(field,value){
  // Keep the controls on the saved selection until all pending edits are safe.
  $(field).value=state[field];
  if(value===state[field]||$(field).disabled)return;
  const controls=['demo','player','parse','useName','provenance'].map($);
  const disabled=controls.map(control=>control.disabled);
  controls.forEach(control=>{control.disabled=true;});
  try{await leave();}finally{controls.forEach((control,i)=>{control.disabled=disabled[i];});}
  savedLocation=null;state.pending=null;state[field]=value;
  if(field==='demo')state.player='';
  clearReview();$('demo').value=state.demo;
  if(field==='demo')setDemo();
  else{$('player').value=state.player;$('parse').disabled=!state.player;}
  remember();
}
for(const field of ['demo','player'])$(field).onchange=guard(e=>changeSelection(field,e.target.value));
$('parse').onclick=guard(async()=>{
  validName();
  if(!state.player)throw new Error('Select the player you want to review.');
  const demo=state.demo,player=state.player;
  const body=JSON.stringify({playerId:player,autoRecord:$('autoRecord').checked,before:Number($('batchBefore').value),after:Number($('batchAfter').value)});
  await leave();
  if(demo!==state.demo||player!==state.player)return;
  const j=await api(`/api/demos/${demo}/select`,{method:'POST',body});
  if(demo!==state.demo||player!==state.player)return;
  if(j.state==='complete')await loadRounds();else{
    state.pending={id:j.id,demo,player};remember();
    $('parseState').textContent='Queued. Parsing runs once, then rounds can be resumed.';
  }
  await poll();
});
$('provenance').onclick=guard(async()=>{if(!state.demo)throw new Error('Choose a demo first.');await api(`/api/demos/${state.demo}/provenance`,{method:'PUT',body:JSON.stringify({source:$('source').value,sourceMatchId:$('sourceMatchId').value,split:$('split').value,trainingPermitted:$('trainingPermitted').checked})});await refreshDemos();setDemo();message('Source details saved.');});
$('anchor').oninput=()=>setAnchor($('anchor').value);
function addMoment(t){const w=contextWindow(t);state.moments.push({id:crypto.randomUUID(),...w,categories:['other'],assessment:'uncertain',facts:'',known:'',unknown:'',reason:'',alternative:'',confidence:'low',priority:1,evidence:[],missedDetector:null,footageId:null});renderMoments();markDirty();}
$('addMoment').onclick=()=>{addMoment(Number($('anchor').value)||0);};
$('addWindowMoment').onclick=guard(()=>{const w={start:Number($('windowStart').value),end:Number($('windowEnd').value)},t=Number($('anchor').value);if(w.start<0||w.end>w.start+state.replay.durationSec||w.end>state.replay.durationSec||w.end<=w.start)throw new Error('Choose a valid marked window inside this round.');if(t<w.start||t>w.end)throw new Error('Seek to a decision inside the marked window first.');addMoment(t);Object.assign(state.moments.at(-1),w);renderMoments();markDirty();});
for(const id of ['notes','language','fullRoundReviewed'])$(id).oninput=markDirty;
$('status').onchange=()=>{state.dirty=true;clearTimeout(state.timer);$('saveState').textContent='Save to apply status';};
$('save').onclick=guard(()=>save(true));
$('reload').onclick=guard(async()=>{if(state.dirty&&!confirm('Discard unsaved edits and reload the saved revision?'))return;clearTimeout(state.timer);await state.saving.catch(()=>{});await loadRound(state.round);message();});
$('reveal').onclick=guard(async()=>{if(!$('fullRoundReviewed').checked)throw new Error('Review the full round and tick the confirmation first.');await leave();state.independent=true;state.dirty=true;try{await save(true);await loadRound(state.round);}catch(e){state.independent=false;throw e;}});
$('next').onclick=guard(async()=>{await leave();const i=state.rounds.findIndex(r=>r.number===state.round);if(i+1<state.rounds.length)await loadRound(state.rounds[i+1].number);else message('You reached the last round. Check the queue for unfinished reviews.');});
function download(training){validName();const params=new URLSearchParams({labeller:state.labeller,training:String(training)});if($('exportSplit').value&&!training)params.set('split',$('exportSplit').value);window.location.assign('/api/export?'+params);}
$('export').onclick=guard(async()=>{await leave();download(false);});$('exportTrain').onclick=guard(async()=>{await leave();download(true);});
window.addEventListener('beforeunload',e=>{if(state.dirty){e.preventDefault();e.returnValue='';}});
document.addEventListener('keydown',e=>{if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='s'){e.preventDefault();(clipFlow.active?saveClipLabel('draft',true):save(true)).catch(e=>message(e.message));}});
window.addEventListener('DOMContentLoaded',async()=>{
  savedLocation=safeRead('rr.annotation.location');
  state.labeller=savedLocation?.labeller||'';$('labeller').value=state.labeller;
  const update=()=>poll().catch(e=>{
    $('saveState').textContent='Server unavailable · keep this tab open';
    if(e.status)message(e.message);
  });
  await update();
  setInterval(update,2500);
});
