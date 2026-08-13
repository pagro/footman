const fs=require('fs'),vm=require('vm');
let src=fs.readFileSync(__dirname+'/server.js','utf8');
src=src.replace("const {WebSocketServer,WebSocket}=require('ws');","const WebSocket={OPEN:1}; class WebSocketServer{constructor(){} on(){}}");
src=src.replace(/setInterval\(\(\)=>\{for\(const room of rooms\.values\(\)\)tickRoom\(room\);\},1000\/TICK_RATE\);/, '');
src=src.replace(/const wss=new WebSocketServer\(\{server\}\);[\s\S]*?server\.listen\(PORT,\(\)=>console\.log\(`Infantry v183 4v4 authoritative multiplayer on port \$\{PORT\}`\)\);/, '');
src += `\n;globalThis.TEST={makeRoom,replaceBotWithHuman,restoreBot,humanCount,teamMembers,makeEntity,fireRifle,fireFlame,updateTimers,WEAPON_STATS,processCommands,updateEntity,tickRoom,rooms,chooseJoinTeam,findBotSlot,snapshotFor,getProjectile:()=>nextProjectileId};`;
const ctx={require,console,process,setTimeout,clearTimeout,Buffer,__dirname};vm.createContext(ctx);vm.runInContext(src,ctx,{filename:'server.test.js'});
const T=ctx.TEST;
function assert(c,m){if(!c)throw new Error(m)}
const dummy=id=>({playerId:id,roomCode:'',readyState:1,send(){}});

// A room is always 4v4.
const room=T.makeRoom('TEST');
assert(T.teamMembers(room,'blue').length===4,'blue should start 4');
assert(T.teamMembers(room,'red').length===4,'red should start 4');
assert([...room.players.values()].every(x=>x.isBot),'room should start all bots');

// Fill the room with eight humans. Team assignment must remain balanced 4/4.
const humans=[];
for(let i=0;i<8;i++){
  const team=T.chooseJoinTeam(room);
  assert(team,'slot should exist');
  const ws=dummy('H'+i),p=T.replaceBotWithHuman(room,ws,team);
  assert(p&&!p.isBot,'human should replace a bot');
  humans.push(p);
  assert(T.teamMembers(room,'blue').length===4&&T.teamMembers(room,'red').length===4,'4v4 invariant after join');
}
assert(T.humanCount(room,'blue')===4&&T.humanCount(room,'red')===4,'eight humans should balance 4/4');
assert(!T.chooseJoinTeam(room),'ninth human should have no slot');

// Leaving/refill: replace a human with a bot in the same team slot.
const leaving=humans[0],teamBefore=leaving.team,slotBefore=leaving.slotIndex;
T.restoreBot(room,leaving);
assert(T.teamMembers(room,teamBefore).length===4,'team remains four after refill');
assert([...room.players.values()].some(x=>x.isBot&&x.team===teamBefore&&x.slotIndex===slotBefore),'bot refills exact vacated slot');

// Bot rifle continuous hold cannot bypass burst cooldown.
const b=[...room.players.values()].find(x=>x.isBot);
b.classId='footman';b.input.lmb=true;b.fireCd=0;b.rifleBurstLeft=0;b.rifleBurstTimer=0;
let start=T.getProjectile();
for(let i=0;i<90;i++){T.updateTimers(b);T.fireRifle(room,b);} // 3 seconds
let botShots=T.getProjectile()-start;
assert(botShots>=3&&botShots<=12,`bot rifle cooldown unreasonable: ${botShots}`);

// Human rifle: holding LMB gives one three-round burst until released.
const h=T.makeEntity(room,'HOLD','blue',0,false);h.ready=true;h.input.lmb=true;h.fireCd=0;start=T.getProjectile();
for(let i=0;i<75;i++){T.updateTimers(h);T.fireRifle(room,h);} // 2.5 sec held
let humanHeldShots=T.getProjectile()-start;assert(humanHeldShots===3,`held rifle should be exactly 3 shots, got ${humanHeldShots}`);
h.input.lmb=false;T.fireRifle(room,h);h.input.lmb=true;
for(let i=0;i<30;i++){T.updateTimers(h);T.fireRifle(room,h);}
assert(T.getProjectile()-start===6,'release/repress should create second burst');

// Flamethrower consumes Energy only after its 0.5 s charge and then at burst cadence.
const f=T.makeEntity(room,'FLAME','blue',1,false);f.ready=true;f.classId='heavy';f.heavyPrimary='flamethrower';f.input.lmb=true;f.energy=200;const e0=f.energy;
for(let i=0;i<30;i++){T.updateTimers(f);T.fireFlame(room,f);} // 1 sec
assert(f.energy<e0,'flamethrower should consume Energy');
assert(f.energy>=180,'one second should not consume absurd Energy');

// Radar is personal and lasts 5 seconds when commanded.
h.commandQueue.push({kind:'radar'});T.processCommands(room,h);assert(h.radarTimer===5,'radar should start at 5 seconds');

// Snapshot roster is four entries per side.
const viewer=[...room.players.values()].find(x=>!x.isBot);
viewer.ready=true;viewer.alive=true;
const snap=T.snapshotFor(room,viewer);
assert(snap.roster.blue.length===4&&snap.roster.red.length===4,'snapshot roster must be 4/4');

console.log(JSON.stringify({ok:true,slots:{blue:4,red:4},humansAfterFill:{blue:4,red:4},botRifleShotsIn3s:botShots,radarSeconds:h.radarTimer,flameEnergyAfter1s:f.energy},null,2));
