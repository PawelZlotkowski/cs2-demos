const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const nodes=new Map();const $=id=>{if(!nodes.has(id))nodes.set(id,{value:'',textContent:'',hidden:true,disabled:false,checked:false,setAttribute(k,v){this[k]=v;},focus(){this.focused=true;},scrollIntoView(){}});return nodes.get(id);};
let requests=[],failConfirmation=false,holdSave=null,advances=0;
const sandbox={console,$,setTimeout,clearTimeout,JSON,Promise,
 state:{demo:'demo',player:'123',labeller:'qa',round:1,replay:{},demos:[{id:'demo',players:[{id:'123',name:'Selected player'}]}]},
 playback:{clip:{id:'other',alignmentConfirmed:false},clips:[]},
 document:{body:{classList:{add(){},remove(){},toggle(){return true;}}}},window:{addEventListener(){}},
 message(){},guard:f=>f,leaveVoice(){},showClipInfo(){},
 api:async(path,options)=>{requests.push({path,options});if(path.endsWith('/confirm')){if(failConfirmation)throw new Error('Connection lost');return {id:'a',alignmentConfirmed:true,state:'ready'};}
 if(path.includes('/label?')){if(holdSave)await holdSave;return {...JSON.parse(options.body),revision:requests.length};}throw new Error('Unexpected '+path);}};
vm.createContext(sandbox);vm.runInContext(fs.readFileSync('apps/api/app/annotation_static/batches.js','utf8'),sandbox);
const run=code=>vm.runInContext(code,sandbox);
function reset(){run('clearTimeout(clipFlow.timer)');requests=[];failConfirmation=false;holdSave=null;advances=0;nodes.clear();
 run("clipFlow.active={id:'a',state:'ready',round:1,start:0,end:15,anchor:10,alignmentConfirmed:false,finding:{detector:'test',summary:'Synthetic test',evidence:{}}};clipFlow.items=[clipFlow.active,{...clipFlow.active,id:'b'}];clipFlow.queue=[];clipFlow.summary={id:'batch'};clipFlow.revision=null;clipFlow.dirty=false;clipFlow.conflict=false;clipFlow.advancing=false;clipFlow.saving=Promise.resolve();renderBatch=()=>{};");
 sandbox.advance=()=>{advances++;};run("refreshBatch=async()=>{};openBatchClip=async id=>{advance();clipFlow.active=clipFlow.items.find(c=>c.id===id);};");
 $('clipVerdict').value='wrong';$('clipAssessment').value='uncertain';$('clipNotes').value='Keep my explanation';$('clipLanguage').value='en';
}
(async()=>{
 reset();await assert.rejects(run('nextReadyClip()'),/step 1/);assert.equal(requests.length,0);assert.equal(advances,0);assert.equal($('clipError').hidden,false);assert.equal($('clipVerified').focused,true);assert.equal($('clipNotes').value,'Keep my explanation');
 await run("confirmClipFootage('a')");assert.equal($('clipVerified').checked,true);assert.equal(sandbox.playback.clip.alignmentConfirmed,false);assert.equal(requests[0].path,'/api/footage/a/confirm');
 await run('nextReadyClip()');assert.equal(advances,1);assert.equal(run('clipFlow.active.id'),'b');let payload=JSON.parse(requests[1].options.body);assert.equal(payload.status,'complete');assert.equal(payload.verdict,'wrong');assert.equal(payload.assessment,'uncertain');assert.equal(payload.notes,'Keep my explanation');
 reset();run('clipFlow.dirty=true');await assert.rejects(run('nextReadyClip()'),/step 1/);await new Promise(r=>setTimeout(r,1000));assert.equal(JSON.parse(requests[0].options.body).status,'draft');assert.equal(run('clipFlow.dirty'),false);
 reset();$('clipVerdict').value='';$('clipAssessment').value='';await run("confirmClipFootage('a')");await assert.rejects(run('nextReadyClip()'),/step 2.*step 3/);assert.equal($('clipVerdict').focused,true);assert.equal(advances,0);
 reset();failConfirmation=true;await assert.rejects(run("confirmClipFootage('a')"),/Connection lost/);assert.equal($('clipVerified').checked,false);assert.equal(run('clipFlow.active.alignmentConfirmed'),false);assert.equal($('clipNotes').value,'Keep my explanation');
 reset();await run("saveClipLabel('draft',true)");assert.equal(JSON.parse(requests[0].options.body).status,'draft');assert.equal(advances,0);
 reset();await run("confirmClipFootage('a')");let release;holdSave=new Promise(r=>release=r);const first=run('nextReadyClip()');await Promise.resolve();await run('nextReadyClip()');release();await first;assert.equal(advances,1);assert.equal(requests.filter(r=>r.path.includes('/label?')).length,1);
 console.log('Clip labelling: specific missing fields, exact-clip verification, failed verification, draft preservation, save-and-next and double-click protection passed.');
})().catch(e=>{console.error(e);process.exitCode=1;});
