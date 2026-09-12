const fs=require('fs'),vm=require('vm'),assert=require('assert');
const source=['sonant.js','music.js','boss-music.js','music-controller.js','pickup-audio.js','game.js'].map(name=>fs.readFileSync('src/'+name,'utf8')).join('\n');
function fresh(){
  const nodes=new Map(),listeners={};
  const gradient={addColorStop(){}};
  const g=new Proxy({}, {get:(o,k)=>k in o?o[k]:k.startsWith('create')?()=>gradient:()=>{},set:(o,k,v)=>(o[k]=v,true)});
  function el(id){if(!nodes.has(id))nodes.set(id,{hidden:false,textContent:'',innerHTML:'',style:{},children:[],firstElementChild:{style:{}},classList:{add(){},remove(){}},setAttribute(){},append(x){this.children.push(x)},focus(){},getContext(){return g},toDataURL(){return 'data:image/png;base64,'},addEventListener(k,f){listeners[id+':'+k]=f},setPointerCapture(){},getBoundingClientRect(){return{left:0,top:0,width:80,height:80}}});return nodes.get(id)}
  const sandbox={console,Math,Set,Number,AbortController,innerWidth:1200,innerHeight:800,devicePixelRatio:1,matchMedia:()=>({matches:false}),document:{getElementById:el,createElement:()=>el(Math.random()),addEventListener(k,f){listeners['document:'+k]=f},documentElement:{}},window:{addEventListener(k,f){listeners[k]=f}},localStorage:{getItem(){return null},setItem(){}},requestAnimationFrame(){}};
  vm.createContext(sandbox);vm.runInContext(source,sandbox);
  const run=s=>vm.runInContext(s,sandbox);
  run('startGame(); enemies=[]; bullets=[]; shots=[]; pickups=[]; spawnTimer=1000; fireTimer=1000; player.inv=0; freeze=0;');
  return {run,nodes,listeners};
}
const tests=[];
function test(name,fn){try{tests.push({name,result:fn(fresh())})}catch(e){tests.push({name,error:e.stack})}}
test('dash kill and refill',({run})=>run(`(()=>{spawnEnemy(0,player.x+110,player.y,0);keys.add('d');dash();for(let i=0;i<15;i++)step(1/120);return{mode,kills,hp:player.hp,cooldown:player.cooldown,dash:player.dash,score}})()`));
test('dash bullet protection',({run})=>run(`(()=>{dash();bullets.push({x:player.x+10,y:player.y,vx:0,vy:0,r:6,life:4});step(1/120);return{hp:player.hp,bullets:bullets.length}})()`));
// Place a shot at a visible point, then invert the renderer's projectile plane.
// The assertions exercise the normal step loop, never the collision helper.
function visualBulletCase(run,angle,forward,side,height){return run(`(()=>{
  player.x=500;player.y=350;player.angle=${angle};player.hp=5;player.inv=0;player.dash=0;player.vx=player.vy=0;freeze=0;
  const c=Math.cos(player.angle),s=Math.sin(player.angle),screen=project(player.x+c*${forward}-s*${side},player.y+s*${forward}+c*${side},${height});
  const o=project(0,0,22),u=project(1,0,22),v=project(0,1,22),ax=u.x-o.x,ay=u.y-o.y,bx=v.x-o.x,by=v.y-o.y,det=ax*by-ay*bx,dx=screen.x-o.x,dy=screen.y-o.y;
  bullets=[{x:(dx*by-dy*bx)/det,y:(ax*dy-ay*dx)/det,vx:0,vy:0,r:5,life:1}];
  step(1/120);return{hp:player.hp,remaining:bullets.length,angle:player.angle,screen};
})()`)}
for(const [facing,angle] of [['right',0],['down',Math.PI/2],['left',Math.PI],['up',-Math.PI/2]]){
  test('enemy bullet hits visible body edge facing '+facing,({run})=>{const r=visualBulletCase(run,angle,22,0,22);assert.equal(r.hp,4);assert.equal(r.remaining,0);return r});
  test('enemy bullet hits projected head center facing '+facing,({run})=>{const r=visualBulletCase(run,angle,24,0,43.5);assert.equal(r.hp,4);assert.equal(r.remaining,0);return r});
}
test('enemy bullets clearly beyond body and head remain near misses',({run})=>{
  const cases=[];for(const angle of [0,Math.PI/2,Math.PI,-Math.PI/2])for(const point of [[0,70,26],[90,0,43.5]]){const r=visualBulletCase(run,angle,...point);assert.equal(r.hp,5);assert.equal(r.remaining,1);cases.push(r)}return cases;
});
test('isolated horn and tail grazes do not damage the unicorn',({run})=>{
  const horn=visualBulletCase(run,0,37,0,77),tail=visualBulletCase(run,0,-53,0,19);for(const r of [horn,tail]){assert.equal(r.hp,5);assert.equal(r.remaining,1)}return{horn,tail};
});
test('invulnerability consumes enemy bullets then expires into real damage',({run})=>{
  const r=run(`(()=>{player.inv=.05;bullets=[{x:player.x,y:player.y,vx:0,vy:0,r:5,life:1}];step(1/120);const protectedHit={hp:player.hp,remaining:bullets.length};for(let i=0;i<8;i++)step(1/120);const expiredInv=player.inv;bullets=[{x:player.x,y:player.y,vx:0,vy:0,r:5,life:1}];step(1/120);return{protectedHit,expiredInv,hp:player.hp,remaining:bullets.length,inv:player.inv}})()`);
  assert.equal(r.protectedHit.hp,5);assert.equal(r.protectedHit.remaining,0);assert.equal(r.expiredInv,0);assert.equal(r.hp,4);assert.equal(r.remaining,0);assert(r.inv>1.4);return r;
});
test('simultaneous enemy bullets remove only one heart',({run})=>{
  const r=run(`(()=>{player.inv=0;bullets=[-3,0,3].map(dx=>({x:player.x+dx,y:player.y,vx:0,vy:0,r:5,life:1}));step(1/120);return{hp:player.hp,remaining:bullets.length,inv:player.inv}})()`);assert.equal(r.hp,4);assert.equal(r.remaining,0);assert(r.inv>1.4);return r;
});
test('boss one damage per dash',({run})=>run(`(()=>{bossSpawned=true;boss={x:W/2,y:H*.28,hp:100,max:100,r:49,clock:2,phase:0,spin:0,hit:0,lastDash:-1,born:0};player.x=W/2;player.y=H*.28;player.dash=.19;dashSerial=1;updateBoss(0);updateBoss(0);return{hp:boss.hp,playerHp:player.hp}})()`));
test('death stops pickup collection',({run,nodes})=>{const result=run(`(()=>{player.hp=1;spawnEnemy(0,player.x,player.y,0);dropPickup(3,player.x,player.y);const p=pickups[0];step(1/120);collectPickup(p);return{mode,hp:player.hp,score,overdrive,pickupLife:p.life,best}})()`);assert.equal(result.pickupLife,30);return{...result,renderedResult:nodes.get('result-stats').innerHTML}});
test('death overwritten by victory',({run})=>run(`(()=>{player.hp=1;spawnEnemy(0,player.x,player.y,0);bossSpawned=true;boss={x:W/2,y:H*.28,hp:1,max:100,r:49,clock:2,phase:0,spin:0,hit:0,lastDash:-1,born:0};shots.push({x:boss.x,y:boss.y,vx:0,vy:0,life:1});step(1/120);return{mode,hp:player.hp,score,best}})()`));
test('split pickups improve shots and cap at five',({run})=>{const r=run(`(()=>{const out=[];for(let i=0;i<7;i++){dropPickup(0,player.x,player.y);const p=pickups.at(-1);collectPickup(p);shots=[];shootAt({x:player.x+100,y:player.y});out.push({gunLevel,shots:shots.length,life:p.life});}return out})()`);r.forEach((p,i)=>{assert.equal(p.gunLevel,Math.min(5,i+2));assert.equal(p.shots,p.gunLevel);assert.equal(p.life,0)});return r});
test('normal boss victory',({run})=>run(`(()=>{bossSpawned=true;boss={x:W/2,y:H*.28,hp:10,max:100,r:49,clock:2,phase:0,spin:0,hit:0,lastDash:-1,born:0};player.x=W/2;player.y=H*.28;player.dash=.19;dashSerial=1;updateBoss(0);return{mode,score,best}})()`));
test('pause does not advance run',({run})=>run(`(()=>{pauseGame();const before=elapsed;for(let i=0;i<120;i++)step(1/120);return{mode,before,elapsed}})()`));
test('restart resets run and restores initial rainbow',({run})=>{const r=run(`(()=>{score=456;elapsed=81;gunLevel=4;trailLevel=2;bossSpawned=true;boss={hp:30};player.hp=1;dashSerial=12;overdrive=5;firing=true;keys.add('x');dropPickup(0,player.x,player.y);startGame();return{mode,score,elapsed,gunLevel,trailLevel,bossSpawned,boss,hp:player.hp,dashSerial,overdrive,enemies:enemies.length,firing,keyCount:keys.size,pickups:pickups.map(p=>({...p,dx:p.x-player.x,dy:p.y-player.y}))}})()`);assert.equal(r.pickups.length,1);assert.equal(r.pickups[0].type,3);assert.equal(r.pickups[0].life,30);assert.equal(r.pickups[0].dx,110);assert.equal(r.pickups[0].dy,85);return r});
test('run continues past ninety seconds while boss lives',({run})=>{const r=run(`(()=>{elapsed=90;bossSpawned=true;boss={x:W/2,y:H*.28,hp:100,max:100,r:49,clock:2,phase:0,spin:0,hit:0,lastDash:-1,born:0};step(1/120);return{mode,elapsed}})()`);assert.equal(r.mode,'playing');assert(r.elapsed>90);return r});
function key(listeners,k,repeat=false,type='keydown'){listeners[type]({key:k,repeat,metaKey:false,ctrlKey:false,altKey:false,preventDefault(){}})}
test('dash scores each enemy once',({run})=>{const r=run(`(()=>{spawnEnemy(0,player.x+90,player.y,0);spawnEnemy(0,player.x+140,player.y,0);dash();for(let i=0;i<60;i++)step(1/120);return{kills,hp:player.hp,maxCombo,cooldown:player.cooldown}})()`);assert.equal(r.kills,2);assert.equal(r.hp,5);assert.equal(r.maxCombo,2);assert.equal(r.cooldown,0);return r});
test('second dash damages boss again',({run})=>{const r=run(`(()=>{bossSpawned=true;boss={x:W/2,y:H*.28,hp:100,max:100,r:49,clock:2,phase:0,spin:0,hit:0,lastDash:-1,born:0};player.x=W/2;player.y=H*.28;player.dash=.19;dashSerial=1;updateBoss(0);updateBoss(0);dashSerial=2;updateBoss(0);updateBoss(0);return{hp:boss.hp,lastDash:boss.lastDash}})()`);assert.equal(r.hp,76);assert.equal(r.lastDash,2);return r});
test('post-dash protection expires',({run})=>{const r=run(`(()=>{dash();for(let i=0;i<30;i++)step(1/120);damagePlayer();const protectedHP=player.hp;for(let i=0;i<15;i++)step(1/120);damagePlayer();return{protectedHP,expiredHP:player.hp}})()`);assert.equal(r.protectedHP,5);assert.equal(r.expiredHP,4);return r});
test('holding dash does not repeat',({run,listeners})=>{key(listeners,' ');run('step(1/120)');for(let i=0;i<180;i++){key(listeners,' ',true);run('step(1/120)')}const heldSerial=run('dashSerial');key(listeners,' ',false,'keyup');key(listeners,' ');run('step(1/120)');const secondSerial=run('dashSerial');assert.equal(heldSerial,1);assert.equal(secondSerial,2);return{heldSerial,secondSerial}});
test('paused input cannot queue movement or dash',({run,listeners})=>{run('pauseGame()');key(listeners,'w');key(listeners,' ');run('for(let i=0;i<120;i++)step(1/120)');const paused=run('({mode,elapsed,dashBuffer,keys:[...keys]})');key(listeners,'Enter');run('step(1/120)');const resumed=run('({mode,dashSerial,keys:[...keys],y:player.y})');assert.equal(paused.mode,'paused');assert.equal(paused.elapsed,0);assert.equal(paused.dashBuffer,0);assert.equal(paused.keys.length,0);assert.equal(resumed.mode,'playing');assert.equal(resumed.dashSerial,0);assert.equal(resumed.keys.length,0);return{paused,resumed}});
test('pickup collection preserves active controls',({run})=>{const r=run(`(()=>{keys.add('w');keys.add('x');firing=true;dashBuffer=.13;aim={x:player.x+100,y:player.y,sx:800,sy:300,active:true};dropPickup(1,player.x,player.y);collectPickup(pickups[0]);return{mode,trailLevel,keys:[...keys],firing,dashBuffer,aim:{...aim},screenHidden:$('screen').hidden}})()`);assert.equal(r.mode,'playing');assert.equal(r.trailLevel,1);assert.equal(r.firing,true);assert.equal(r.keys.includes('w'),true);assert.equal(r.keys.includes('x'),true);assert.equal(r.dashBuffer,.13);assert.equal(r.aim.active,true);assert.equal(r.aim.sx,800);assert.equal(r.aim.sy,300);assert.equal(r.screenHidden,true);return r});
test('heart raises initial five health to six only once',({run})=>{const r=run(`(()=>{const initial=player.hp;dropPickup(2,player.x,player.y);const p=pickups[0];collectPickup(p);const first=player.hp;collectPickup(p);return{initial,first,second:player.hp,life:p.life,inv:player.inv,mode}})()`);assert.equal(r.initial,5);assert.equal(r.first,6);assert.equal(r.second,6);assert.equal(r.life,0);assert(r.inv>=1.2);assert.equal(r.mode,'playing');return r});
test('seven-health heart stays available until six health',({run})=>{const r=run(`(()=>{player.hp=7;dropPickup(2,player.x,player.y);const p=pickups[0];collectPickup(p);const waiting={hp:player.hp,life:p.life};step(1/120);const onFloor=pickups.includes(p);player.hp=6;step(1/120);return{waiting,onFloor,hp:player.hp,life:p.life,pickupCount:pickups.length}})()`);assert.equal(r.waiting.hp,7);assert.equal(r.waiting.life,30);assert.equal(r.onFloor,true);assert.equal(r.hp,7);assert.equal(r.life,0);assert.equal(r.pickupCount,0);return r});
test('repeated hearts reach seven without exceeding it',({run})=>{const r=run(`(()=>{const health=[];for(let i=0;i<6;i++){dropPickup(2,player.x,player.y);collectPickup(pickups.at(-1));health.push(player.hp)}return{health,remaining:pickups.filter(p=>p.life>0).length}})()`);assert.deepEqual(Array.from(r.health),[6,7,7,7,7,7]);assert.equal(r.remaining,4);return r});
test('health HUD shows only current hearts through pickups and damage',({run})=>{const r=run(`(()=>{updateHUD();const displays=[$('hearts').textContent];for(let i=0;i<2;i++){dropPickup(2,player.x,player.y);collectPickup(pickups.at(-1));displays.push($('hearts').textContent)}player.inv=0;damagePlayer();updateHUD();displays.push($('hearts').textContent);return{displays,hp:player.hp}})()`);r.displays.forEach((display,i)=>{assert.equal((display.match(/♥/g)||[]).length,[5,6,7,6][i]);assert.equal(display.includes('♡'),false)});assert.equal(r.hp,6);return r});
test('full-health notice appears once per entry and pickup remains usable',({run})=>{const r=run(`(()=>{let notices=0;const originalText=text;text=(...args)=>{if(args[2]==='FULL HEALTH')notices++;return originalText(...args)};player.hp=7;dropPickup(2,player.x,player.y);const p=pickups[0];step(1/120);const entered={notices,hp:player.hp,onFloor:pickups.includes(p),full:p.full};for(let i=0;i<120;i++)step(1/120);const staying={notices,hp:player.hp,onFloor:pickups.includes(p)};player.x=p.x+40;step(1/120);const outsideFull=p.full;player.x=p.x;step(1/120);const returned={notices,hp:player.hp,onFloor:pickups.includes(p)};player.inv=0;damagePlayer();step(1/120);return{entered,staying,outsideFull,returned,final:{notices,hp:player.hp,life:p.life,pickupCount:pickups.length}}})()`);assert.equal(r.entered.notices,1);assert.equal(r.entered.hp,7);assert.equal(r.entered.onFloor,true);assert(r.entered.full);assert.equal(r.staying.notices,1);assert.equal(r.staying.hp,7);assert.equal(r.staying.onFloor,true);assert(!r.outsideFull);assert.equal(r.returned.notices,2);assert.equal(r.returned.hp,7);assert.equal(r.returned.onFloor,true);assert.equal(r.final.notices,2);assert.equal(r.final.hp,7);assert.equal(r.final.life,0);assert.equal(r.final.pickupCount,0);return r});
test('afterburn pickups cap at three',({run})=>{const r=run(`(()=>{const levels=[];for(let i=0;i<5;i++){dropPickup(1,player.x,player.y);const p=pickups.at(-1);collectPickup(p);collectPickup(p);levels.push(trailLevel)}return levels})()`);assert.deepEqual(Array.from(r),[1,2,3,3,3]);return r});
test('pickup proximity requires walking onto stationary drop',({run})=>{const r=run(`(()=>{dropPickup(0,player.x+29,player.y);const p=pickups[0],x=p.x,y=p.y;for(let i=0;i<120;i++)step(1/120);const outside={x:p.x,y:p.y,life:p.life,gunLevel,count:pickups.length};player.x+=2;step(1/120);return{x,y,outside,gunLevel,count:pickups.length,life:p.life}})()`);assert.equal(r.outside.x,r.x);assert.equal(r.outside.y,r.y);assert.equal(r.outside.gunLevel,1);assert.equal(r.outside.count,1);assert(Math.abs(r.outside.life-29)<1e-8);assert.equal(r.gunLevel,2);assert.equal(r.count,0);assert.equal(r.life,0);return r});
test('pickup expiry and collection pause with the run',({run})=>{const r=run(`(()=>{dropPickup(0,player.x,player.y);const p=pickups[0];pauseGame();collectPickup(p);for(let i=0;i<120;i++)step(1/120);const paused={mode,life:p.life,gunLevel};resumeGame();step(1/120);const resumed={mode,gunLevel,life:p.life};pickups=[];dropPickup(1,player.x+100,player.y);pickups[0].life=.01;for(let i=0;i<3;i++)step(1/120);return{paused,resumed,expiredCount:pickups.length,trailLevel}})()`);assert.equal(r.paused.mode,'paused');assert.equal(r.paused.life,30);assert.equal(r.paused.gunLevel,1);assert.equal(r.resumed.mode,'playing');assert.equal(r.resumed.gunLevel,2);assert.equal(r.resumed.life,0);assert.equal(r.expiredCount,0);assert.equal(r.trailLevel,0);return r});
test('dropped pickups clamp inside arena',({run})=>{const r=run(`(()=>{dropPickup(0,-10000,-10000);dropPickup(1,10000,10000);return{W,H,drops:pickups.map(p=>({...p}))}})()`);for(const p of r.drops){assert(p.x>=48&&p.x<=r.W-48);assert(p.y>=105&&p.y<=r.H-85);assert.equal(p.life,30)}assert.deepEqual(r.drops.map(p=>p.type),[0,1]);return r});
test('hearts drop every ten kills with other powers between them',({run})=>{const r=run(`(()=>{const drops=[];for(let i=1;i<=40;i++){const before=pickups.length;eliminate({dead:false,type:0,x:100,y:140},false);if(pickups.length>before)drops.push({kill:i,type:pickups.at(-1).type})}return{kills,drops}})()`);assert.equal(r.kills,40);assert.deepEqual(r.drops.map(p=>p.kill),[1,5,10,15,20,25,30,35,40]);assert.deepEqual(r.drops.map(p=>p.type),[0,1,2,3,2,0,2,1,2]);assert.deepEqual(r.drops.filter(p=>p.type===2).map(p=>p.kill),[10,20,30,40]);return r});
test('kills alone never trigger overdrive',({run})=>{const r=run(`(()=>{for(let i=0;i<30;i++)eliminate({dead:false,type:0,x:100,y:140},false);for(let i=0;i<120;i++)step(1/120);return{overdrive,kills,mode,gunLevel,pickupCount:pickups.length}})()`);assert.equal(r.overdrive,0);assert.equal(r.kills,30);assert.equal(r.mode,'playing');assert.equal(r.gunLevel,1);assert(r.pickupCount>0);return r});
test('combo points and expiry',({run})=>{const r=run(`(()=>{for(let i=0;i<3;i++)eliminate({dead:false,type:0,x:200+i*40,y:200},false);const before=score;comboTime=0;eliminate({dead:false,type:0,x:400,y:200},false);return{before,after:score,combo,maxCombo,kills}})()`);assert.equal(r.before,400);assert.equal(r.after,500);assert.equal(r.combo,1);assert.equal(r.maxCombo,3);return r});
test('uppercase movement release',({run,listeners})=>{key(listeners,'A');assert.equal(run("keys.has('a')"),true);key(listeners,'A',false,'keyup');assert.equal(run("keys.has('a')"),false);return{passed:true}});
test('restart key from pause',({run,listeners})=>{run('elapsed=42;score=900;pauseGame()');key(listeners,'r');const r=run('({mode,elapsed,score,keys:[...keys]})');assert.equal(r.mode,'playing');assert.equal(r.elapsed,0);assert.equal(r.score,0);return r});
test('rainbow pickup starts six seconds of overdrive only once',({run})=>{const r=run(`(()=>{dropPickup(3,player.x,player.y);const p=pickups[0];collectPickup(p);const activated=overdrive,consumedLife=p.life;for(let i=0;i<120;i++)step(1/120);const beforeAgain=overdrive;collectPickup(p);const afterAgain=overdrive;for(let i=0;i<610;i++)step(1/120);return{activated,consumedLife,beforeAgain,afterAgain,expired:overdrive,life:p.life}})()`);assert.equal(r.activated,6);assert.equal(r.consumedLife,0);assert(Math.abs(r.beforeAgain-5)<1e-8);assert.equal(r.afterAgain,r.beforeAgain);assert(r.expired<=0);assert(r.life<=0);return r});
test('terminal transitions cannot repeat boss reward',({run})=>{const r=run(`(()=>{bossSpawned=true;boss={x:W/2,y:H*.28,hp:10,max:100,r:49,clock:2,phase:0,spin:0,hit:0,lastDash:-1,born:0};player.x=W/2;player.y=H*.28;player.dash=.19;dashSerial=1;updateBoss(0);updateBoss(0);endGame(false);return{mode,score,bestScore:best.score}})()`);assert.equal(r.mode,'victory');assert.equal(r.score,10000);assert.equal(r.bestScore,10000);return r});
test('combat keys never skip death or victory results',({run,listeners,nodes})=>{
  const outcomes=[];
  for(const won of [false,true]){
    run(`startGame();score=1234;elapsed=72;endGame(${won})`);
    const expectedMode=won?'victory':'dead';
    for(let i=0;i<130;i++){
      for(const k of [' ','Shift','w','a','s','d','ArrowUp','ArrowDown','ArrowLeft','ArrowRight','x'])key(listeners,k,i%2===0);
      run('step(1/120)');assert.equal(run('mode'),expectedMode);
    }
    assert.equal(run('elapsed'),72);assert.equal(run('score'),1234);assert.equal(nodes.get('screen').hidden,false);
    if(won){assert.equal(nodes.get('message-title').innerHTML,'YOU WIN.');assert.match(nodes.get('message-copy').textContent,/destroyed|cleared|victory/i)}
    outcomes.push(expectedMode);
  }
  return{resultsPersisted:outcomes};
});
test('result delay locks replay button and deliberate restart keys',({run,listeners,nodes})=>{
  run('endGame(false)');assert.equal(run('resultDelay'),.8);assert.equal(nodes.get('resume').disabled,true);
  key(listeners,'Enter');key(listeners,'r');nodes.get('resume').onclick();assert.equal(run('mode'),'dead');
  run('for(let i=0;i<60;i++)step(1/120)');assert(run('resultDelay')>0);assert.equal(nodes.get('resume').disabled,true);
  run('for(let i=0;i<40;i++)step(1/120)');assert.equal(run('resultDelay'),0);assert.equal(nodes.get('resume').disabled,false);
  key(listeners,'Enter',true);key(listeners,'r',true);assert.equal(run('mode'),'dead');
  key(listeners,'Enter');assert.equal(run('mode'),'playing');assert.equal(run('player.hp'),5);
  run('endGame(false)');assert.equal(nodes.get('resume').disabled,true);nodes.get('resume').onclick();assert.equal(run('mode'),'dead');
  run('for(let i=0;i<100;i++)step(1/120)');nodes.get('resume').onclick();assert.equal(run('mode'),'playing');
  run('endGame(true);for(let i=0;i<100;i++)step(1/120)');key(listeners,'r');assert.equal(run('mode'),'playing');
  return{delay:.8,buttonRearmed:true,enterAndRAfterDelay:true,repeatedKeysIgnored:true};
});
test('R still restarts immediately during active play',({run,listeners})=>{run('score=321;elapsed=12');key(listeners,'r');const r=run('({mode,score,elapsed})');assert.equal(r.mode,'playing');assert.equal(r.score,0);assert.equal(r.elapsed,0);return r});
test('boss arrives at sixty seconds and clears the arena',({run})=>{
  const r=run(`(()=>{elapsed=59.98;player.inv=999;spawnEnemy(0,100,150,99);spawnEnemy(1,150,150,99);spawnEnemy(2,200,150,99);enemyBullet(100,200,0,0);step(1/120);const before=bossSpawned;for(let i=0;i<2;i++)step(1/120);const arrival={elapsed,hp:boss.hp,max:boss.max,enemies:enemies.length,bullets:bullets.length};boss.born=0;boss.clock=1000;spawnTimer=-1;for(let i=0;i<1200;i++)step(1/120);return{before,arrival,after:{mode,enemies:enemies.length,bullets:bullets.length,elapsed}}})()`);
  assert.equal(r.before,false);assert(r.arrival.elapsed>=60&&r.arrival.elapsed<60.01);assert.equal(r.arrival.hp,180);assert.equal(r.arrival.max,180);assert.equal(r.arrival.enemies,0);assert.equal(r.arrival.bullets,0);assert.equal(r.after.mode,'playing');assert.equal(r.after.enemies,0);assert.equal(r.after.bullets,0);assert(r.after.elapsed>70);return r;
});
test('boss alternates aimed fans and radial attacks with a half-health rage phase',({run})=>{
  const r=run(`(()=>{spawnBoss();boss.born=0;player.x=100;player.y=H-150;const cycles=[];for(let i=0;i<5;i++){bullets=[];boss.clock=0;if(i===3)boss.hp=boss.max/2;updateBoss(1/120);cycles.push({phase:boss.phase,count:bullets.length,clock:boss.clock,aim:boss.angle,speeds:bullets.map(b=>Math.hypot(b.vx,b.vy)),angles:bullets.map(b=>Math.atan2(b.vy,b.vx)),radii:bullets.map(b=>b.r),enemies:enemies.length})}return cycles})()`);
  r.forEach((c,i)=>{
    assert.equal(c.phase,i+1);assert.equal(c.count,[5,12,5,16,7][i]);assert.equal(c.clock,i>=3?1.6:2.2);c.speeds.forEach(v=>assert(Math.abs(v-[220,165,220,195,220][i])<1e-8));c.radii.forEach(v=>assert.equal(v,5));assert.equal(c.enemies,0);
    if(c.phase%2){const offsets=c.angles.map(a=>Math.atan2(Math.sin(a-c.aim),Math.cos(a-c.aim))).sort((a,b)=>a-b);offsets.forEach((a,j)=>assert(Math.abs(a-(j-(c.count-1)/2)*.14)<1e-8))}
    else{const angles=c.angles.map(a=>(a+Math.PI*2)%(Math.PI*2)).sort((a,b)=>a-b);angles.forEach((a,j)=>{const next=j+1<angles.length?angles[j+1]:angles[0]+Math.PI*2;assert(Math.abs(next-a-Math.PI*2/c.count)<1e-8)})}
  });return r;
});
test('boss locks aimed fire during the final warning window',({run})=>{
  const r=run(`(()=>{spawnBoss();boss.born=0;boss.clock=1;player.x=W*.82;player.y=H*.5;for(let i=0;i<42;i++){elapsed+=1/120;updateBoss(1/120)}const locked=boss.angle,clock=boss.clock;player.x=W*.12;player.y=H*.75;for(let i=0;i<120&&bullets.length===0;i++){elapsed+=1/120;updateBoss(1/120)}return{locked,clock,after:boss.angle,currentTarget:Math.atan2(player.y-boss.y,player.x-boss.x),angles:bullets.map(b=>Math.atan2(b.vy,b.vx))}})()`);
  assert(r.clock<.7&&r.clock>0);assert(Math.abs(r.locked)>.1);assert.equal(r.after,r.locked);assert(Math.abs(r.currentTarget-r.locked)>.5);assert.equal(r.angles.length,5);const offsets=r.angles.map(a=>Math.atan2(Math.sin(a-r.locked),Math.cos(a-r.locked))).sort((a,b)=>a-b);offsets.forEach((a,i)=>assert(Math.abs(a-(i-2)*.14)<1e-8));return r;
});
test('boss moves smoothly into the arena instead of staying at the top',({run})=>{
  const r=run(`(()=>{spawnBoss();boss.born=0;boss.clock=1000;player.x=90;player.y=H-100;elapsed=Math.PI/(2*.9);const initial={x:boss.x,y:boss.y},target={x:W/2+Math.sin(elapsed*.6)*W*.26,y:H*.42+Math.sin(elapsed*.9)*H*.14};updateBoss(.1);const first={x:boss.x,y:boss.y};for(let i=0;i<240;i++)updateBoss(1/120);const settled={x:boss.x,y:boss.y};boss.x=initial.x;boss.y=initial.y;updateBoss(1);return{initial,target,first,settled,capped:{x:boss.x,y:boss.y},H}})()`);
  assert(Math.abs(r.first.x-(r.initial.x+(r.target.x-r.initial.x)*.2))<1e-8);assert(Math.abs(r.first.y-(r.initial.y+(r.target.y-r.initial.y)*.2))<1e-8);assert(r.first.y>r.initial.y&&r.first.y<r.target.y);assert(r.settled.y>r.H*.53);assert(Math.abs(r.capped.x-r.target.x)<1e-8);assert(Math.abs(r.capped.y-r.target.y)<1e-8);return r;
});
test('real dash damages the boss without refunding cooldown',({run})=>{
  const r=run(`(()=>{spawnBoss();boss.born=0;boss.clock=1000;player.x=boss.x-100;player.y=boss.y;keys.add('d');dash();const initialCooldown=player.cooldown;for(let i=0;i<60&&boss.hp===boss.max;i++)step(1/120);return{hp:boss.hp,max:boss.max,cooldown:player.cooldown,initialCooldown,elapsed,lastDash:boss.lastDash,dashSerial,mode}})()`);
  assert.equal(r.max,180);assert.equal(r.hp,168);assert.equal(r.mode,'playing');assert.equal(r.lastDash,r.dashSerial);assert(r.cooldown>0);assert(Math.abs(r.cooldown-(r.initialCooldown-r.elapsed))<1e-8);return r;
});
test('boss HUD announces rage at exactly half health',({run})=>{
  const r=run(`(()=>{spawnBoss();updateHUD();const full=$('boss-name').textContent;boss.hp=boss.max/2+1;updateHUD();const above=$('boss-name').textContent;boss.hp=boss.max/2;updateHUD();const half=$('boss-name').textContent;boss.hp=1;updateHUD();return{full,above,half,low:$('boss-name').textContent}})()`);
  assert.equal(r.full,'THE WARDEN');assert.equal(r.above,'THE WARDEN');assert.equal(r.half,'WARDEN / ENRAGED');assert.equal(r.low,'WARDEN / ENRAGED');return r;
});
test('enemy bullets cap at thirty-six and expire after 3.6 seconds',({run})=>{
  const r=run(`(()=>{for(let i=0;i<50;i++)enemyBullet(100,150,0,0);const capped=bullets.length,lives=bullets.map(b=>b.life);for(let i=0;i<431;i++)step(1/120);const beforeExpiry=bullets.length;for(let i=0;i<2;i++)step(1/120);const expired=bullets.length;enemyBullet(100,150,0,0);return{capped,lives,beforeExpiry,expired,refilled:bullets.length}})()`);
  assert.equal(r.capped,36);r.lives.forEach(v=>assert.equal(v,3.6));assert.equal(r.beforeExpiry,36);assert.equal(r.expired,0);assert.equal(r.refilled,1);return r;
});
test('spitter keeps direct aim and alternates its second shot every 2.6 seconds',({run})=>{
  const r=run(`(()=>{player.x=600;player.y=300;player.inv=999;spawnEnemy(2,300,300,0);const e=enemies[0];e.clock=.82;const originalBullet=enemyBullet,log=[];enemyBullet=(...a)=>{log.push({at:elapsed,a:a[2],speed:a[3],r:a[4]});originalBullet(...a)};for(let i=0;i<18;i++)step(1/120);const locked=e.angle;player.x=300;player.y=550;for(let i=0;i<480;i++)step(1/120);return{locked,log,hp:e.hp}})()`);
  assert.equal(r.log.length,4);assert(Math.abs(r.log[0].a-r.locked)<1e-8);assert(Math.abs(r.log[1].a-r.locked-.16)<1e-8);assert.equal(r.log[0].at,r.log[1].at);assert.equal(r.log[2].at,r.log[3].at);assert(Math.abs(r.log[3].a-r.log[2].a+.16)<1e-8);assert(r.log[2].a>1);r.log.forEach(b=>{assert.equal(b.speed,160);assert.equal(b.r,5)});const gap=r.log[2].at-r.log[0].at;assert(gap>=2.6-1e-8&&gap<=2.6+1/120+1e-8);assert.equal(r.hp,4);return r;
});
for(const [facing,angle] of [['right',0],['down',Math.PI/2],['left',Math.PI],['up',-Math.PI/2]])test('spitter hits a stationary target facing '+facing,({run})=>{
  const cases=[];
  for(const approach of [0,Math.PI/2,Math.PI,-Math.PI/2]){
    const r=run(`(()=>{W=1400;H=1400;enemies=[];bullets=[];shots=[];pickups=[];freeze=0;elapsed=0;spawnTimer=1000;player.x=700;player.y=700;player.vx=player.vy=0;player.angle=${angle};player.hp=5;player.inv=0;player.dash=0;spawnEnemy(2,player.x-Math.cos(${approach})*280,player.y-Math.sin(${approach})*280,0);enemies[0].clock=.82;for(let i=0;i<120&&bullets.length===0;i++)step(1/120);const count=bullets.length;enemies=[];for(let i=0;i<360;i++)step(1/120);return{hp:player.hp,count}})()`);
    assert.equal(r.count,2);assert.equal(r.hp,4,'An undefended stationary target must be hit from approach '+approach);cases.push(r);
  }
  return cases;
});
test('ambient doubles respect thirty enemies and three spitters',({run})=>{
  const r=run(`(()=>{const saved=Math.random;try{Math.random=()=>0;elapsed=40;for(let i=0;i<3;i++)spawnEnemy(2,100+i*80,150,99);spawnTimer=0;step(1/120);const limited={total:enemies.length,spitters:enemies.filter(e=>e.type===2).length,interval:spawnTimer};enemies=[];for(let i=0;i<30;i++)spawnEnemy(0,100+i*20,150,99);spawnTimer=0;step(1/120);const population=enemies.length;enemies.pop();spawnTimer=0;step(1/120);const nearCap=enemies.length;enemies=[];const additions=[],extras=[];for(let i=0;i<4;i++){const before=enemies.length;spawnTimer=0;step(1/120);additions.push(enemies.length-before);extras.push(enemies.at(-1).type)}enemies=[];elapsed=10;spawnTimer=0;step(1/120);return{limited,population,nearCap,additions,extras,earlyCount:enemies.length}}finally{Math.random=saved}})()`);
  assert.equal(r.limited.total,5);assert.equal(r.limited.spitters,3);assert(Math.abs(r.limited.interval-Math.max(.5,1.05-(40+1/120)*.009))<1e-8);assert.equal(r.population,30);assert.equal(r.nearCap,30);assert.deepEqual(Array.from(r.additions),[2,2,2,2]);assert.deepEqual(Array.from(r.extras),[0,0,0,0]);assert.equal(r.earlyCount,1);return r;
});
test('enemy health matches the readable combat pacing',({run})=>{const r=run(`(()=>{for(let type=0;type<3;type++)spawnEnemy(type,100+type*100,150,0);return enemies.map(e=>({type:e.type,hp:e.hp,clock:e.clock}))})()`);assert.deepEqual(r.map(e=>e.hp),[3,4,4]);assert(r[2].clock>.7);return r});
const expected={
  'dash kill and refill':{mode:'playing',kills:1,hp:5,cooldown:0},
  'dash bullet protection':{hp:5,bullets:0},
  'boss one damage per dash':{hp:88,playerHp:5},
  'death stops pickup collection':{mode:'dead',hp:0,score:0,overdrive:0},
  'death overwritten by victory':{mode:'dead',hp:0,score:0},
  'normal boss victory':{mode:'victory',score:10000},
  'pause does not advance run':{mode:'paused',before:0,elapsed:0},
  'restart resets run and restores initial rainbow':{mode:'playing',score:0,elapsed:0,gunLevel:1,trailLevel:0,bossSpawned:false,boss:null,hp:5,dashSerial:0,overdrive:0,enemies:2,firing:false,keyCount:0}
};
for(const rec of tests){try{for(const [field,value]of Object.entries(expected[rec.name]||{}))assert.equal(rec.result[field],value,rec.name+': '+field)}catch(e){rec.error=e.stack}}
console.log(tests.filter(t=>!t.error).length+' / '+tests.length+' gameplay checks passed.'); for(const t of tests)if(t.error)console.error(t.name,t.error);
if(tests.some(t=>t.error))process.exitCode=1;
