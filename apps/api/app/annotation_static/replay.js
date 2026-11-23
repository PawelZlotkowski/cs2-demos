'use strict';
const playback={time:0,playing:false,last:0,window:null,clips:[],clip:null,image:null,sides:{},generation:0};
function footagePath(){return `/api/demos/${state.demo}/players/${state.player}/rounds/${state.round}/footage`;}
function pauseReplay(){playback.playing=false;$('video').pause();$('play').textContent='Play';}
function resetReplay(){
  pauseReplay();playback.generation++;playback.clip=null;playback.clips=[];playback.window=null;
  $('video').removeAttribute('src');$('video').load();$('clockSource').value='radar';$('footageList').replaceChildren();$('clipSelect').replaceChildren();
  $('videoFile').value='';$('videoOffset').value='0';$('clipInfo').textContent='No saved footage selected.';
}
function openReplay(context){
  playback.sides=context.sides||{};playback.time=0;playback.window=null;
  $('seek').max=state.replay.durationSec;$('seek').value='0';$('loopWindow').checked=false;
  $('windowStart').value='0';$('windowEnd').value=state.replay.durationSec;
  const image=new Image();playback.image=image;
  image.onload=()=>drawRadar();image.onerror=()=>{$('radarInfo').textContent='Map image unavailable. Player positions still use saved radar coordinates.';};
  image.src=`/static/maps/${state.demos.find(d=>d.id===state.demo).map}_radar.png`;
  refreshFootage().catch(e=>message(e.message));
}
function seekReplay(t,fromVideo=false){
  if(!state.replay)return;
  playback.time=Math.max(0,Math.min(Number(t)||0,state.replay.durationSec));
  $('seek').value=String(playback.time);$('clock').textContent=`${playback.time.toFixed(2)} / ${state.replay.durationSec.toFixed(2)} s`;
  $('anchor').value=playback.time.toFixed(3);
  $('tick').textContent=`Demo tick ${Math.min(state.replay.endTick,state.replay.startTick+Math.round(playback.time*state.replay.tickRate))} · elapsed since freeze end`;
  const clip=playback.clip,video=$('video');
  if(clip&&!fromVideo&&Number.isFinite(video.duration)){
    const target=Math.max(0,Math.min(video.duration,playback.time-clip.start));
    if(!playback.playing||Math.abs(video.currentTime-target)>.1)video.currentTime=target;
  }
  $('videoCoverage').textContent=clip&&(playback.time<clip.start||playback.time>clip.start+clip.duration)?'Outside this video’s coverage — the edge frame is held. Radar continues.':'';
  drawRadar();
}
function contextWindow(anchor){
  const before=Math.max(0,Math.min(60,Number($('before').value)||0));
  const after=Math.max(0,Math.min(60,Number($('after').value)||0));
  return ReplayMath.window(anchor,before,after,state.replay.durationSec);
}
function watchContext(anchor){
  pauseReplay();playback.window=contextWindow(anchor);
  $('windowStart').value=playback.window.start.toFixed(3);$('windowEnd').value=playback.window.end.toFixed(3);
  $('loopWindow').checked=true;
  const covering=playback.clips.find(c=>c.state==='ready'&&c.start<=playback.window.start+.05&&c.start+c.duration>=playback.window.end-.05);
  if(covering)selectClip(covering.id);else $('clockSource').value='radar';
  seekReplay(playback.window.start);
  $('contextInfo').textContent=`Decision ${anchor.toFixed(2)} s · context ${playback.window.start.toFixed(2)}–${playback.window.end.toFixed(2)} s (clamped to this round)`;
  $('replayStage').scrollIntoView({behavior:'smooth',block:'start'});
}
function limits(){
  if(!$('loopWindow').checked)return {start:0,end:state.replay.durationSec};
  let start=Math.max(0,Number($('windowStart').value)||0),end=Math.min(state.replay.durationSec,Number($('windowEnd').value)||0);
  const clip=playback.clip;
  if(clip&&$('clockSource').value==='video'&&document.body.classList.contains('clip-review')){
    const duration=$('video').duration;
    start=Math.max(start,clip.start);
    end=Math.min(end,clip.start+clip.duration,clip.start+(Number.isFinite(duration)?duration:clip.duration));
  }
  if(end<=start)throw new Error('Context end must be after its start.');
  return {start,end};
}
async function playReplay(){
  if(playback.playing){pauseReplay();return;}
  const window=limits();if(playback.time<window.start||playback.time>=window.end)seekReplay(window.start);
  playback.playing=true;playback.last=performance.now();$('play').textContent='Pause';
  if($('clockSource').value==='video'){
    const c=playback.clip;
    if(!c){pauseReplay();throw new Error('Select saved footage to play the video.');}
    if($('loopWindow').checked&&(c.start>window.start+.05||c.start+c.duration<window.end-.05)){
      pauseReplay();throw new Error('This footage does not cover the marked loop. Shorten the window or use the Radar clock.');
    }
    if(playback.time<c.start||playback.time>=c.start+c.duration)seekReplay(Math.max(window.start,c.start));
    $('video').playbackRate=Number($('speed').value);
    // The browser can start playback as soon as metadata arrives. A new clip
    // or a deliberate pause can interrupt that pending play request.
    try{await $('video').play();}catch(e){if(e.name==='AbortError'||playback.clip?.id!==c.id)return;pauseReplay();throw e;}
  }
}
function animateReplay(now){
  if(playback.playing&&state.replay){
    const delta=Math.min((now-playback.last)/1000,.2);playback.last=now;
    const window=limits();
    const time=$('clockSource').value==='video'&&playback.clip?$('video').currentTime+playback.clip.start:playback.time+delta*Number($('speed').value);
    if(time>=window.end){
      if($('loopWindow').checked){seekReplay(window.start);}
      else{seekReplay(window.end);pauseReplay();}
    }else if($('clockSource').value!=='video'||Number.isFinite($('video').duration)){
      seekReplay(time,$('clockSource').value==='video');
    }
  }
  requestAnimationFrame(animateReplay);
}
function drawRadar(){
  if(!state.replay)return;
  const canvas=$('radar'),ctx=canvas.getContext('2d');ctx.clearRect(0,0,1024,1024);ctx.fillStyle='#151e25';ctx.fillRect(0,0,1024,1024);
  if(playback.image?.complete&&playback.image.naturalWidth)ctx.drawImage(playback.image,0,0,1024,1024);
  ctx.fillStyle='#0004';ctx.fillRect(0,0,1024,1024);
  const roster=new Map(state.replay.players.map(p=>[p.id,p]));
  const players=ReplayMath.at(state.replay.samples,playback.time,state.replay.events).sort((a,b)=>(a.id===state.player)-(b.id===state.player));
  const focusSide=playback.sides[state.player];
  const recent=state.replay.samples.filter(s=>s.t>=playback.time-4&&s.t<=playback.time).map(s=>s.players.find(p=>p.id===state.player)).filter(p=>p?.alive&&Number.isFinite(p.rx));
  ctx.strokeStyle='#ffffff90';ctx.lineWidth=4;ctx.beginPath();recent.forEach((p,i)=>i?ctx.lineTo(p.rx,p.ry):ctx.moveTo(p.rx,p.ry));ctx.stroke();
  for(const p of players){
    if(!Number.isFinite(p.rx)||!Number.isFinite(p.ry))continue;
    const selected=p.id===state.player,side=playback.sides[p.id];
    const color=selected?'#fff':!side||!focusSide?'#d6c78d':side===focusSide?'#93bdd1':'#e78f88';
    ctx.save();ctx.translate(p.rx,p.ry);ctx.strokeStyle='#151e25';ctx.lineWidth=3;ctx.fillStyle=color;
    if(p.alive){ctx.beginPath();ctx.arc(0,0,selected?13:10,0,2*Math.PI);ctx.fill();ctx.stroke();
      const yaw=-p.yaw*Math.PI/180;ctx.beginPath();ctx.moveTo(Math.cos(yaw)*14,Math.sin(yaw)*14);ctx.lineTo(Math.cos(yaw)*29,Math.sin(yaw)*29);ctx.strokeStyle=color;ctx.lineWidth=5;ctx.stroke();
    }else{ctx.strokeStyle=color;ctx.lineWidth=4;ctx.beginPath();ctx.moveTo(-8,-8);ctx.lineTo(8,8);ctx.moveTo(8,-8);ctx.lineTo(-8,8);ctx.stroke();}
    ctx.font=selected?'bold 22px system-ui':'18px system-ui';ctx.lineWidth=5;ctx.strokeStyle='#111';const name=roster.get(p.id)?.name||p.id;
    ctx.strokeText(`${name}${selected?' · '+p.health+' HP':''}`,17,-13);ctx.fillText(`${name}${selected?' · '+p.health+' HP':''}`,17,-13);ctx.restore();
  }
  const events=state.replay.events.filter(e=>e.t<=playback.time&&e.t>playback.time-3);
  $('radarInfo').textContent=players.length?`White: selected player · blue: team · red: opponents · ×: dead. ${events.map(e=>e.label).join(' · ')}`:'No position samples available for this round.';
}
async function refreshFootage(){
  if(!state.replay)return;const path=footagePath(),generation=playback.generation;
  const clips=await api(path);if(path!==footagePath()||generation!==playback.generation)return;
  playback.clips=clips;
  optionList($('clipSelect'),clips.filter(c=>c.state==='ready').map(c=>[c.id,`${c.source==='csdm'?'Recorded POV':'Uploaded footage'} · ${c.start.toFixed(1)}–${(c.start+c.duration).toFixed(1)} s`]),playback.clip?.id||'','Choose saved footage');
  if(playback.clip){playback.clip=clips.find(c=>c.id===playback.clip.id)||null;showClipInfo();}
  const box=$('footageList');box.replaceChildren();
  for(const c of clips.filter(c=>c.state!=='ready')){
    const row=el('div',`${c.start.toFixed(1)}–${c.end.toFixed(1)} s · ${c.state}${c.state==='queued'?' · waiting for host recorder':''}${c.error?' · '+c.error:''}`,{className:'job'});
    if(c.state==='failed'){const button=el('button','Retry recording');button.onclick=guard(async()=>{await api(`/api/recordings/${c.id}/retry`,{method:'POST'});await refreshFootage();});row.append(button);}box.append(row);
  }
}
function showClipInfo(){const c=playback.clip;$('confirmFootage').disabled=!c||c.alignmentConfirmed;$('clipInfo').textContent=c?`${c.width}×${c.height} · ${c.duration.toFixed(2)} s · ${c.alignmentConfirmed?'Player and timing verified':'Verify POV and align a visible event with the radar before using as evidence.'}`:'No saved footage selected.';}
function selectClip(id){
  pauseReplay();
  playback.clip=playback.clips.find(c=>c.id===id&&c.state==='ready')||null;
  $('clockSource').value=playback.clip?'video':'radar';
  $('clipSelect').value=playback.clip?.id||'';
  const video=$('video'),url=playback.clip?.url||null;
  if(video.getAttribute('src')!==url||video.error){
    if(url)video.src=url;else video.removeAttribute('src');
    video.load();
  }
  showClipInfo();
}
async function recordContext(anchor){
  const path=footagePath();await api(path,{method:'POST',body:JSON.stringify({anchor,before:Number($('before').value),after:Number($('after').value)})});
  if(path===footagePath())await refreshFootage();message('Context recording queued. Start tools/record_label_clips.py on the host with Steam and CS2 configured. The MP4 will appear here when ready.');
}
function attachFootage(moment){
  const c=playback.clip;if(!c?.alignmentConfirmed)throw new Error('Select footage and verify its player and timing first.');
  if(c.start>moment.start+.05||c.start+c.duration<moment.end-.05)throw new Error('The selected video must cover this whole moment.');
  moment.footageId=c.id;markDirty();renderMoments();
}
$('play').onclick=guard(playReplay);$('seek').oninput=()=>{pauseReplay();seekReplay($('seek').value);};
$('expandReplay').onclick=guard(async()=>{if(document.fullscreenElement)await document.exitFullscreen();else await $('replayStage').requestFullscreen();});
$('speed').onchange=()=>{$('video').playbackRate=Number($('speed').value);};
$('clockSource').onchange=()=>{pauseReplay();seekReplay(playback.time);};
for(const [id,step] of [['backFrame',-1],['nextFrame',1]])$(id).onclick=()=>{pauseReplay();seekReplay(playback.time+step/($('clockSource').value==='video'?ReplayMath.fps(playback.clip?.fps):8));};
$('watchContext').onclick=()=>watchContext(Number($('anchor').value));
$('recordContext').onclick=guard(()=>recordContext(playback.window?.anchor??Number($('anchor').value)));
$('markStart').onclick=()=>{pauseReplay();$('windowStart').value=playback.time.toFixed(3);$('loopWindow').checked=true;};
$('markEnd').onclick=()=>{pauseReplay();$('windowEnd').value=playback.time.toFixed(3);$('loopWindow').checked=true;};
for(const id of ['windowStart','windowEnd','loopWindow'])$(id).onchange=()=>pauseReplay();
$('clipSelect').onchange=()=>selectClip($('clipSelect').value);
$('confirmFootage').onclick=guard(async()=>{const id=playback.clip?.id;if(id){await confirmClipFootage(id);await refreshFootage();}});
$('uploadFootage').onclick=guard(async()=>{
  const file=$('videoFile').files[0];if(!file)throw new Error('Choose an H.264 MP4 first.');
  const path=footagePath(),generation=playback.generation;$('uploadFootage').disabled=true;
  try{const clip=await api(`${path}/upload?start=${encodeURIComponent($('videoOffset').value)}`,{method:'POST',headers:{'Content-Type':'video/mp4'},body:file});
    if(path===footagePath()&&generation===playback.generation){await refreshFootage();selectClip(clip.id);}
  }finally{$('uploadFootage').disabled=false;}
});
$('video').onloadedmetadata=()=>seekReplay(playback.time);
$('video').onerror=()=>{if(playback.clip)message('The browser could not play this footage. Use an H.264 MP4 and check the saved file.');};
$('video').onended=()=>{
  if(playback.playing&&$('clockSource').value==='video'){
    const w=limits(),c=playback.clip;
    if($('loopWindow').checked&&c&&c.start<=w.start+.05&&c.start+c.duration>=w.end-.05){seekReplay(w.start);$('video').play().catch(e=>{pauseReplay();message(e.message);});}
    else pauseReplay();
  }
};
document.addEventListener('keydown',e=>{
  if(e.ctrlKey||e.metaKey||e.altKey||e.target.isContentEditable||
     ['INPUT','TEXTAREA','SELECT','BUTTON','SUMMARY','A'].includes(e.target.tagName)||!state.replay)return;
  if(e.code==='Space'){e.preventDefault();guard(playReplay)();}
  if(e.key==='ArrowLeft'||e.key==='ArrowRight'){e.preventDefault();pauseReplay();seekReplay(playback.time+(e.key==='ArrowLeft'?-1:1));}
  if(e.key.toLowerCase()==='m'&&!document.body.classList.contains('clip-review')){$('addMoment').click();}
});
requestAnimationFrame(animateReplay);
setInterval(()=>refreshFootage().catch(()=>{}),3000);
