const fs=require('fs'),vm=require('vm'),assert=require('assert');
const source=['sonant.js','music.js','boss-music.js','music-controller.js','pickup-audio.js','game.js'].map(name=>fs.readFileSync('src/'+name,'utf8')).join('\n'),results=[];
function fresh(){
  const nodes=new Map(),listeners={};
  let rect={left:0,top:0,width:1200,height:800};
  const g=new Proxy({}, {get:(o,k)=>k in o?o[k]:()=>{},set:(o,k,v)=>(o[k]=v,true)});
  function el(id){if(!nodes.has(id))nodes.set(id,{hidden:false,style:{},children:[],classList:{add(){},remove(){}},setAttribute(){},append(x){this.children.push(x)},focus(){},getContext(){return g},toDataURL(){return 'data:image/png;base64,'},addEventListener(k,f){listeners[id+':'+k]=f},getBoundingClientRect(){return rect}});return nodes.get(id)}
  const sandbox={console,Math,Set,Number,AbortController,innerWidth:1200,innerHeight:800,devicePixelRatio:2,matchMedia:()=>({matches:false}),document:{getElementById:el,createElement:()=>el(Math.random()),addEventListener(k,f){listeners['document:'+k]=f},documentElement:{}},window:{addEventListener(k,f){listeners[k]=f}},localStorage:{getItem(){return null},setItem(){}},requestAnimationFrame(){}};
  vm.createContext(sandbox);vm.runInContext(source,sandbox);
  const run=s=>vm.runInContext(s,sandbox);
  run(`startGame();enemies=[];bullets=[];shots=[];pickups=[];spawnTimer=1000;player.inv=999;freeze=0;const originalShoot=shootAt;let shotLog=[];shootAt=function(target){const start=shots.length;originalShoot(target);shotLog.push({at:elapsed,target:{x:target.x,y:target.y},player:{x:player.x,y:player.y},shots:shots.slice(start).map(s=>({...s}))})}`);
  function event(name,opts={}){listeners[name]({button:0,clientX:0,clientY:0,repeat:false,metaKey:false,ctrlKey:false,altKey:false,preventDefault(){},...opts})}
  function pointAt(x,y,kind='world:pointermove'){const p=run(`project(${x},${y},25)`),s=run('scale');event(kind,{clientX:rect.left+p.x*s,clientY:rect.top+p.y*s})}
  function ticks(n){run(`for(let i=0;i<${n};i++)step(1/120)`)}
  return{run,event,pointAt,ticks,sandbox,setRect:r=>rect=r};
}
function near(a,b,tol=1e-8){assert(Math.abs(a-b)<tol,`${a} != ${b}`)}
function test(name,fn){try{results.push({name,status:'pass',details:fn(fresh())})}catch(e){results.push({name,status:'fail',error:e.stack})}}

test('Manual input gates fire, direction and cadence',h=>{
  h.run('spawnEnemy(2,player.x-240,player.y,0);enemies[0].clock=999');
  h.ticks(600);assert.equal(h.run('shotLog.length'),0);
  let p=h.run('({x:player.x,y:player.y})');h.pointAt(p.x+300,p.y,'world:pointerdown');h.ticks(120);
  const log=h.run('shotLog.map(s=>({at:s.at,vx:s.shots[0].vx,vy:s.shots[0].vy}))');
  assert(log.length>=4&&log.length<=5);for(const shot of log){assert(shot.vx>0);near(shot.vy,0)}
  for(let i=1;i<log.length;i++){const gap=log[i].at-log[i-1].at;assert(gap>=.25-1e-9&&gap<=.25+1/120+1e-9)}
  h.event('pointerup');const released=h.run('shotLog.length');h.ticks(120);assert.equal(h.run('shotLog.length'),released);
  h.event('keydown',{key:'x'});h.ticks(120);assert(h.run('shotLog.length')>released);
  h.event('keyup',{key:'x'});const xReleased=h.run('shotLog.length');h.ticks(120);assert.equal(h.run('shotLog.length'),xReleased);
  h.event('keydown',{key:' '});h.ticks(120);assert.equal(h.run('shotLog.length'),xReleased);
  p=h.run('({x:player.x,y:player.y})');const beforeTap=h.run('shotLog.length');h.pointAt(p.x+200,p.y,'world:pointerdown');h.event('pointerup');assert.equal(h.run('shotLog.length'),beforeTap+1);h.ticks(30);assert.equal(h.run('shotLog.length'),beforeTap+1);
  h.ticks(1);h.run('overdrive=6');const beforeOverdrive=h.run('shotLog.length');p=h.run('({x:player.x,y:player.y})');h.pointAt(p.x+200,p.y,'world:pointerdown');h.ticks(120);const overdriveTimes=h.run(`shotLog.slice(${beforeOverdrive}).map(s=>s.at)`);assert(overdriveTimes.length>=6&&overdriveTimes.length<=7);for(let i=1;i<overdriveTimes.length;i++){const gap=overdriveTimes[i]-overdriveTimes[i-1];assert(gap>=.15-1e-9&&gap<=.15+1/120+1e-9)}h.event('pointerup');
  return{idleShots:0,clickShots:log.length,cadence:log.slice(1).map((s,i)=>+(s.at-log[i].at).toFixed(5)),overdriveCadence:.15,releaseStopped:true,xWorked:true,dashDoesNotFire:true,subTickTapFiresExactlyOne:true};
});

test('Pause, blur and release clear firing',h=>{
  const p=h.run('({x:player.x,y:player.y})');h.pointAt(p.x+300,p.y,'world:pointerdown');h.event('keydown',{key:'x'});h.ticks(1);
  h.event('keydown',{key:'p'});assert.equal(h.run('mode'),'paused');assert.equal(h.run('firing'),false);assert.equal(h.run('keys.size'),0);
  const n=h.run('shotLog.length'),clock=h.run('elapsed');h.event('pointerup',{clientX:-100,clientY:-100});h.ticks(120);assert.equal(h.run('elapsed'),clock);
  h.event('keydown',{key:'Enter'});h.ticks(120);assert.equal(h.run('shotLog.length'),n);
  h.pointAt(p.x+300,p.y,'world:pointerdown');h.ticks(1);h.event('blur');assert.equal(h.run('mode'),'paused');assert.equal(h.run('firing'),false);h.run('resumeGame()');const afterBlur=h.run('shotLog.length');h.ticks(120);assert.equal(h.run('shotLog.length'),afterBlur);
  h.pointAt(p.x+300,p.y,'world:pointerdown');h.event('world:pointerleave');assert.equal(h.run('firing'),false);
  h.pointAt(p.x+300,p.y,'world:pointerdown');h.event('world:pointercancel');assert.equal(h.run('firing'),false);
  return{pauseCleared:true,resumeNeedsFreshPress:true,blurCleared:true,leaveAndCancelCleared:true};
});

test('Ground pickups preserve movement, aiming and held mouse fire',h=>{
  let p=h.run('({x:player.x,y:player.y})');h.pointAt(p.x+250,p.y,'world:pointerdown');h.event('keydown',{key:'d'});
  const before=h.run('({count:shotLog.length,x:player.x,aim:{...aim}})');h.run('dropPickup(0,player.x,player.y)');h.ticks(1);
  const collected=h.run('({mode,firing,held:keys.has("d"),gunLevel,count:pickups.length,aim:{...aim},screenHidden:$("screen").hidden})');
  assert.equal(collected.mode,'playing');assert.equal(collected.firing,true);assert.equal(collected.held,true);assert.equal(collected.gunLevel,2);assert.equal(collected.count,0);assert.equal(collected.screenHidden,true);near(collected.aim.x,before.aim.x);near(collected.aim.y,before.aim.y);
  h.ticks(60);assert(h.run('shotLog.length')>before.count);assert(h.run('player.x')>before.x);assert.equal(h.run('shotLog.at(-1).shots.length'),2);
  h.run('dropPickup(3,player.x,player.y)');h.ticks(1);assert(h.run('overdrive')>5.9);assert.equal(h.run('firing'),true);h.ticks(60);assert.equal(h.run('shotLog.at(-1).shots.length'),4);
  h.event('pointerup');h.event('keyup',{key:'d'});const released=h.run('shotLog.length');h.ticks(120);assert.equal(h.run('shotLog.length'),released);
  return{pickupDidNotOpenModal:true,movementContinued:true,mouseFireContinued:true,splitBolts:2,overdriveBolts:4,releaseStillStops:true};
});

test('Ground pickups preserve keyboard fire and never enable automatic fire',h=>{
  h.run('dropPickup(0,player.x,player.y)');h.ticks(120);assert.equal(h.run('gunLevel'),2);assert.equal(h.run('shotLog.length'),0);
  h.event('keydown',{key:'x'});h.ticks(30);const before=h.run('shotLog.length');h.run('dropPickup(1,player.x,player.y)');h.ticks(1);
  assert.equal(h.run('trailLevel'),1);assert.equal(h.run('keys.has("x")'),true);assert.equal(h.run('mode'),'playing');h.ticks(60);assert(h.run('shotLog.length')>before);
  h.event('keyup',{key:'x'});const released=h.run('shotLog.length');h.run('dropPickup(3,player.x,player.y)');h.ticks(120);assert.equal(h.run('shotLog.length'),released);assert(h.run('overdrive')>0);
  return{idleSplitDidNotFire:true,keyboardFireContinued:true,idleOverdriveDidNotFire:true};
});

test('Cursor inverse matches projectile-plane projection',h=>{
  const cases=[{width:1200,height:800,left:0,top:0},{width:1500,height:920,left:37,top:59},{width:820,height:1000,left:11,top:23}];let maxError=0,count=0;
  for(const r of cases){h.sandbox.innerWidth=r.width;h.sandbox.innerHeight=r.height;h.setRect(r);h.run('resize()');const dims=h.run('({W,H})');
    for(const [u,v]of [[.5,.5],[.15,.2],[.85,.2],[.15,.8],[.85,.8]]){const x=dims.W*u,y=dims.H*v;h.pointAt(x,y);const a=h.run('({...aim})'),p=h.run(`project(${x},${y},25)`);near(a.x,x);near(a.y,y);near(a.sx,p.x);near(a.sy,p.y);maxError=Math.max(maxError,Math.hypot(a.x-x,a.y-y));count++}
  }
  return{points:count,viewportCases:cases.length,maxWorldError:maxError,nonzeroCanvasOffset:true,devicePixelRatio:2};
});

test('Projectile muzzle uses current position and aim',h=>{
  h.run(`player.vx=-120;player.vy=0;player.angle=Math.PI;shootAt({x:player.x+200,y:player.y})`);
  let result=h.run('({p:{x:player.x,y:player.y},s:{...shots[0]}})');near(result.s.x-result.p.x,18);near(result.s.y,result.p.y);near(result.s.vx,760);near(result.s.vy,0);
  h.run('shots=[];shotLog=[];player.vx=0;player.vy=0;player.angle=0;dash()');h.ticks(24);
  const p=h.run('({x:player.x,y:player.y})');h.pointAt(p.x-150,p.y+120,'world:pointerdown');h.ticks(1);
  const entry=h.run('shotLog.at(-1)'),s=entry.shots[0],len=Math.hypot(s.vx,s.vy),dx=entry.target.x-entry.player.x,dy=entry.target.y-entry.player.y,d=Math.hypot(dx,dy);
  near(len,760);near(s.x-entry.player.x,18*dx/d);near(s.y-entry.player.y,18*dy/d);near(s.vx/len,dx/d);near(s.vy/len,dy/d);
  h.run('shots=[];shootAt({x:player.x,y:player.y})');const centered=h.run('({...shots[0]})');assert(Object.values(centered).every(Number.isFinite));
  return{oppositeMovementAim:true,originDistance:18,afterDashCurrentPosition:true,speed:len,cursorOnPlayerFinite:true};
});

test('Every split and overdrive volley keeps its first bolt on the cursor line',h=>{
  const cases=h.run(`(()=>{const out=[];for(const active of [0,6])for(let level=1;level<=5;level++){overdrive=active;gunLevel=level;shots=[];const target={x:player.x+140,y:player.y-90};shootAt(target);out.push({level,active,p:{x:player.x,y:player.y},target,shots:shots.map(s=>({...s}))})}return out})()`);
  for(const c of cases){
    const a=Math.atan2(c.target.y-c.p.y,c.target.x-c.p.x),first=c.shots[0];
    assert.equal(c.shots.length,c.level+(c.active?2:0));near(first.vx,Math.cos(a)*760);near(first.vy,Math.sin(a)*760);near(first.x-c.p.x,Math.cos(a)*18);near(first.y-c.p.y,Math.sin(a)*18);
    const offsets=c.shots.map(s=>{const d=Math.atan2(s.vy,s.vx)-a;return Math.atan2(Math.sin(d),Math.cos(d))});near(offsets[0],0);
    for(let i=2;i<offsets.length;i++)assert(offsets[i]*offsets[i-1]<0);
    for(let i=1;i+1<offsets.length;i+=2)near(Math.abs(offsets[i]),Math.abs(offsets[i+1]));
  }
  return{volleyCases:cases.length,centerShotRetained:true,sideShotsAlternate:true};
});

test('Mouse firing cannot dismiss death or victory results',h=>{
  for(const victory of [false,true]){
    h.run(`startGame();enemies=[];pickups=[];shots=[];shotLog=[];endGame(${victory})`);
    const p=h.run('({x:player.x,y:player.y})');h.pointAt(p.x+200,p.y,'world:pointerdown');h.event('pointerup');h.ticks(120);h.pointAt(p.x+200,p.y,'world:pointerdown');h.event('pointerup');
    assert.equal(h.run('mode'),victory?'victory':'dead');assert.equal(h.run('shotLog.length'),0);assert.equal(h.run('firing'),false);
  }
  return{mouseClicksDoNotRestart:true,noTerminalShots:true};
});

console.log(results.filter(r=>r.status==='pass').length+' / '+results.length+' manual-fire checks passed.');for(const r of results)if(r.status==='fail')console.error(r.name,r.error);if(results.some(r=>r.status==='fail'))process.exitCode=1;
