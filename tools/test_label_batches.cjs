const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
function element(){return {value:'',textContent:'',hidden:true,disabled:false,checked:false,children:[],append(...children){this.children.push(...children);},replaceChildren(...children){this.children=children;},setAttribute(k,v){this[k]=v;},focus(){this.focused=true;},scrollIntoView(){}};}
const nodes=new Map();const $=id=>{if(!nodes.has(id))nodes.set(id,element());return nodes.get(id);};
let requests=[],failConfirmation=false,holdSave=null,advances=0;
const sandbox={console,$,setTimeout,clearTimeout,JSON,Promise,el:(tag,text,props={})=>Object.assign(element(),{tag,textContent:text},props),
 state:{demo:'demo',player:'123',labeller:'qa',round:1,replay:{},demos:[{id:'demo',players:[{id:'123',name:'Selected player'}]}]},
 playback:{clip:{id:'other',alignmentConfirmed:false},clips:[]},
 document:{body:{classList:{add(){},remove(){},toggle(){return true;}}}},window:{addEventListener(){}},
 message(){},guard:f=>f,leaveVoice(){},showClipInfo(){},
 api:async(path,options)=>{requests.push({path,options});if(path.endsWith('/confirm')){if(failConfirmation)throw new Error('Connection lost');return {id:'a',alignmentConfirmed:true,state:'ready'};}
 if(path.includes('/review?'))return run('clipFlow.items');
 if(path.includes('/label?')){if(holdSave)await holdSave;return {...JSON.parse(options.body),revision:requests.length,footage:{alignmentConfirmed:JSON.parse(options.body).confirmFootage}};}throw new Error('Unexpected '+path);}};
vm.createContext(sandbox);vm.runInContext(fs.readFileSync('apps/api/app/annotation_static/batches.js','utf8'),sandbox);
const run=code=>vm.runInContext(code,sandbox);
function reset(){run('clearTimeout(clipFlow.timer)');requests=[];failConfirmation=false;holdSave=null;advances=0;nodes.clear();
 run("clipFlow.active={id:'a',state:'ready',round:1,start:0,end:15,anchor:10,alignmentConfirmed:false,finding:{detector:'test',summary:'Synthetic test',evidence:{}}};clipFlow.items=[clipFlow.active,{...clipFlow.active,id:'b'}];clipFlow.queue=[];clipFlow.summary={id:'batch'};clipFlow.revision=null;clipFlow.dirty=false;clipFlow.conflict=false;clipFlow.advancing=false;clipFlow.saving=Promise.resolve();renderBatch=()=>{};");
 sandbox.advance=()=>{advances++;};run("refreshBatch=async()=>{};openBatchClip=async id=>{advance();clipFlow.active=clipFlow.items.find(c=>c.id===id);};");
 $('clipVerdict').value='wrong';$('clipAssessment').value='uncertain';$('clipNotes').value='Keep my explanation';$('clipLanguage').value='en';$('clipQuality').value='verified';$('clipSelectionVerdict').value='useful';
}
(async()=>{
 reset();run("clipFlow.active.findings=[{id:'F1',t:10,summary:'First observation',evidence:{a:1}},{id:'F2',t:12,summary:'Second observation',evidence:{b:2}}];renderActiveClip(false);");
 assert.equal($('clipSignal').textContent,'10.0 s: First observation; 12.0 s: Second observation');
 assert.equal($('clipVerdict').hidden,true);
 assert.equal(JSON.parse($('clipEvidence').textContent).length,2);
 assert.equal($('clipNotes').value,'Keep my explanation');
 reset();run("clipFlow.active.findings=[{id:'F1',t:10,summary:'First signal',evidence:{}},{id:'F2',t:12,summary:'Second signal',evidence:{}}];clipFlow.active.label={signalReviews:[{findingId:'F1',verdict:'correct'},{findingId:'F2',verdict:'wrong'}],notes:'Mixed signals',footageStatus:'verified',selectionVerdict:'useful'};renderActiveClip(true)");
 assert.equal($('clipSignalReviews').children.length,2);
 assert.equal($('clipSignalReviews').children[0].children[0].value,'correct');
 assert.equal($('clipSignalReviews').children[1].children[0].value,'wrong');
 assert.equal($('clipNotes').value,'Mixed signals');
 reset();$('clipVerdict').value='';$('clipAssessment').value='';
 await run('nextReadyClip()');assert.equal(advances,1);
 let payload=JSON.parse(requests[0].options.body);
 assert.equal(payload.inputMode,'note');assert.equal(payload.confirmFootage,true);
 assert.equal(payload.status,'complete');assert.equal(payload.verdict,null);assert.equal(payload.assessment,null);assert.equal(payload.notes,'Keep my explanation');
 reset();$('clipNotes').value=' ';$('clipVerdict').value='';$('clipAssessment').value='';
 await assert.rejects(run('nextReadyClip()'),/write a note/);assert.equal(requests.length,0);
 assert.equal($('clipNotes').focused,true);assert.equal(advances,0);
 reset();$('clipNotes').value='';await run('nextReadyClip()');
 payload=JSON.parse(requests[0].options.body);assert.equal(payload.inputMode,'structured');assert.equal(payload.verdict,'wrong');
 reset();failConfirmation=true;await assert.rejects(run("confirmClipFootage('a')"),/Connection lost/);
 assert.equal(run('clipFlow.active.alignmentConfirmed'),false);assert.equal($('clipNotes').value,'Keep my explanation');
 reset();await run("saveClipLabel('draft',true)");assert.equal(JSON.parse(requests[0].options.body).status,'draft');assert.equal(advances,0);
 reset();$('clipQuality').value='';await assert.rejects(run('nextReadyClip()'),/check the player/);assert.equal(requests.length,0);
 reset();$('clipSelectionVerdict').value='';await assert.rejects(run('nextReadyClip()'),/worth selecting/);assert.equal(requests.length,0);
 reset();$('clipQuality').value='wrong_player';await run('nextReadyClip()');
 payload=JSON.parse(requests[0].options.body);assert.equal(payload.confirmFootage,false);assert.equal(payload.footageStatus,'wrong_player');assert.equal(payload.verdict,null);assert.equal(payload.selectionVerdict,'unsure');
 reset();run("clipFlow.active.findings=[{id:'F1'},{id:'F2'}];clipFlow.signalRatings={F1:'correct',F2:'wrong'}");await run('nextReadyClip()');
 payload=JSON.parse(requests[0].options.body);assert.equal(payload.verdict,null);assert.deepEqual(payload.signalReviews,[{findingId:'F1',verdict:'correct'},{findingId:'F2',verdict:'wrong'}]);
 reset();await run("confirmClipFootage('a')");let release;holdSave=new Promise(r=>release=r);const first=run('nextReadyClip()');await Promise.resolve();await run('nextReadyClip()');release();await first;assert.equal(advances,1);assert.equal(requests.filter(r=>r.path.includes('/label?')).length,1);
 console.log('Clip labelling: note-only and structured submissions, draft saving, failed verification and double-click protection passed.');
})().catch(e=>{console.error(e);process.exitCode=1;});
