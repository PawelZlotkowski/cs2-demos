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
