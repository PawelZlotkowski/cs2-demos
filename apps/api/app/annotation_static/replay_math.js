'use strict';
// Pure clock/position helpers shared with the lightweight regression tests.
const ReplayMath = {
  window(anchor, before, after, duration) {
    return {start: Number(Math.max(0, anchor-before).toFixed(3)), anchor,
      end: Math.min(duration, Number((anchor+after).toFixed(3)))};
  },
  at(samples, time, events=[]) {
    if (!samples.length) return [];
    let lo=0, hi=samples.length-1;
    while(lo<hi){const mid=Math.ceil((lo+hi)/2);if(samples[mid].t<=time)lo=mid;else hi=mid-1;}
    const a=samples[lo], b=samples[Math.min(lo+1,samples.length-1)];
    const u=Math.max(0,Math.min(1,(time-a.t)/(b.t-a.t||1)));
    const next=new Map(b.players.map(p=>[p.id,p]));
    const dead=new Set(events.filter(e=>e.type==='kill'&&e.t<=time).map(e=>e.victimId));
    return a.players.map(p=>{
      const q=next.get(p.id)||p;
      // Never interpolate discrete health/death state or move a corpse towards a respawn.
      const move=p.alive&&q.alive?u:0;
      return {...p, rx:p.rx+(q.rx-p.rx)*move, ry:p.ry+(q.ry-p.ry)*move,
        yaw:p.yaw+(((q.yaw-p.yaw+540)%360)-180)*move,
        alive:p.alive&&!dead.has(p.id),health:dead.has(p.id)?0:p.health};
    });
  },
  fps(value){const [a,b]=String(value||'30/1').split('/').map(Number);return a/(b||1)||30;}
};
if(typeof module!=='undefined')module.exports=ReplayMath;
