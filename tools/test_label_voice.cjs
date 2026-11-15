const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const nodes=new Map();
const get=id=>{if(!nodes.has(id))nodes.set(id,{value:'',hidden:false,disabled:false,scrollIntoView(){}});return nodes.get(id);};
const sandbox={console,Blob,Event,setInterval,clearInterval,setTimeout,clearTimeout,Date,JSON,
  $:get,state:{demo:'demo',player:'player',round:1,labeller:'qa',replay:{}},clipFlow:{active:{id:'clip1'}},
  document:{querySelectorAll:()=>[]},window:{addEventListener(){},MediaRecorder:function(){}},
  MutationObserver:class{observe(){}},guard:f=>f,message(){},navigator:{mediaDevices:{}},api:async()=>({ready:true})};
vm.createContext(sandbox);vm.runInContext(fs.readFileSync('apps/api/app/annotation_static/voice.js','utf8'),sandbox);
(async()=>{
  sandbox.target={value:'Existing note',isConnected:true,disabled:false,dispatchEvent(){this.saved=true;},focus(){},closest(){return {firstChild:{textContent:'Reason'}};}};
  vm.runInContext("voice.session={target,context:voiceContext()};$('voicePreview').value='Spoken note';",sandbox);
  assert.throws(()=>vm.runInContext('leaveVoice()',sandbox),/Insert or discard/);
  get('voiceInsert').onclick();assert.equal(sandbox.target.value,'Existing note\nSpoken note');assert.equal(sandbox.target.saved,true);
  get('voiceInsert').onclick();assert.equal(sandbox.target.value,'Existing note\nSpoken note');
  vm.runInContext("voice.session={target,context:voiceContext()};state.round=2;$('voicePreview').value='Another note';",sandbox);
  assert.throws(()=>get('voiceInsert').onclick(),/original annotation changed/);
  assert.equal(sandbox.target.value,'Existing note\nSpoken note');vm.runInContext('discardVoice()',sandbox);
  // A permission request that resolves after Discard must release the microphone.
  let resolvePermission,stopped=false;
  sandbox.navigator.mediaDevices.getUserMedia=()=>new Promise(r=>resolvePermission=r);
  get('clipLanguage').value='en';get('language').value='en';
  const pending=vm.runInContext('startVoice(target)',sandbox);await new Promise(r=>setImmediate(r));
  vm.runInContext('discardVoice()',sandbox);resolvePermission({getTracks:()=>[{stop(){stopped=true;}}]});await pending;
  assert.equal(stopped,true);
  console.log('Voice UI: append without overwrite, no duplicate insertion, wrong-review protection and cancelled microphone permission passed.');
})().catch(e=>{console.error(e);process.exitCode=1;});

