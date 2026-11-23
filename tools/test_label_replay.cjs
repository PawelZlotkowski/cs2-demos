const assert=require('node:assert/strict');
const math=require('../apps/api/app/annotation_static/replay_math.js');
const player=(id,rx,yaw,alive=true)=>({id,rx,ry:10,yaw,alive,health:alive?100:0});
const samples=[{t:0,players:[player('p',0,350)]},{t:1,players:[player('p',100,10)]}];
assert.equal(math.at(samples,.5)[0].rx,50);
assert.equal(math.at(samples,.5)[0].yaw,360); // shortest turn through north
assert.equal(math.at(samples,-1)[0].rx,0);
assert.equal(math.at(samples,4)[0].rx,100);
assert.equal(math.at(samples,.49,[{type:'kill',t:.5,victimId:'p'}])[0].alive,true);
assert.equal(math.at(samples,.5,[{type:'kill',t:.5,victimId:'p'}])[0].alive,false);
assert.equal(math.at(samples,.2,[{type:'kill',t:.5,victimId:'p'}])[0].alive,true); // rewind
assert.deepEqual(math.at([],3),[]);
assert.deepEqual(math.window(2,10,5,20),{start:0,anchor:2,end:7});
assert.deepEqual(math.window(19,10,5,20),{start:9,anchor:19,end:20});
assert.equal(math.fps('30000/1001'),30000/1001);
console.log('Replay clock, interpolation, death/rewind and context-window checks passed.');

async function checkClipPlayback(){
  const fs=require('node:fs');
  const vm=require('node:vm');
  const nodes=new Map();
  const $=id=>{
    if(!nodes.has(id))nodes.set(id,{value:'',textContent:''});
    return nodes.get(id);
  };
  let loads=0,plays=0,clipMode=true;
  const video=$('video');
  Object.assign(video,{
    duration:NaN,currentTime:0,src:null,
    getAttribute(name){return this[name];},
    removeAttribute(name){this[name]=null;},
    load(){loads++;this.duration=NaN;this.currentTime=0;},
    pause(){},
    async play(){plays++;},
  });
  const document={body:{classList:{contains:()=>clipMode}},addEventListener(){}};
  const context=vm.createContext({
    $,document,state:{replay:{durationSec:100,startTick:0,endTick:6400,tickRate:64}},
    guard:fn=>fn,requestAnimationFrame(){},setInterval(){},performance,
  });
  const run=code=>vm.runInContext(code,context);
  run(fs.readFileSync(require.resolve('../apps/api/app/annotation_static/replay.js'),'utf8'));
  run("drawRadar=()=>{}; playback.clips=[{id:'a',state:'ready',url:'/a.mp4',start:5,duration:14.8}, {id:'b',state:'ready',url:'/b.mp4',start:20,duration:8}];");
  $('speed').value=1;
  $('loopWindow').checked=true;
  $('windowStart').value=5;
  $('windowEnd').value=20;
  run("selectClip('a'); seekReplay(8);");
  assert.equal(loads,1);
  await run('playReplay()'); // Play even if metadata hasn't arrived.
  run('animateReplay(performance.now())');
  assert.equal(run('playback.time'),8);
  video.duration=14.75;
  video.onloadedmetadata();
  assert.equal(video.currentTime,3);
  run("selectClip('a'); seekReplay(5);");
  await run('playReplay()');
  assert.equal(loads,1); // Replaying the selected clip keeps the loaded video.
  assert.equal(plays,2);
  assert.equal(run('limits().end'),19.75);
  video.currentTime=14.75;
  video.onended();
  assert.equal(video.currentTime,0);
  assert.equal(plays,3);

  clipMode=false;
  run('pauseReplay()');
  await assert.rejects(run('playReplay()'),/does not cover/);
  run("selectClip('b')");
  assert.equal(loads,2);
  assert.equal(video.src,'/b.mp4');
  console.log('Clip replay before metadata, repeated playback and short recording bounds passed.');
}

checkClipPlayback().catch(error=>{console.error(error);process.exitCode=1;});
