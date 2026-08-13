const fs=require('fs'),vm=require('vm');
let src=fs.readFileSync(__dirname+'/server.js','utf8');
src=src.replace("const {WebSocketServer,WebSocket}=require('ws');","const WebSocket={OPEN:1}; class WebSocketServer{constructor(){} on(){}}");
src=src.replace(/setInterval\(\(\)=>\{for\(const room of rooms\.values\(\)\)tickRoom\(room\);\},1000\/TICK_RATE\);/, '');
src=src.replace(/const wss=new WebSocketServer\(\{server\}\);[\s\S]*?server\.listen\(PORT,[\s\S]*?\);\s*$/, '');
src += `\n;globalThis.TEST={makeRoom,replaceBotWithHuman,restoreBot,humanCount,teamMembers,makeEntity,fireRifle,fireFlame,updateTimers,WEAPON_STATS,CLASSES,processCommands,updateEntity,tickRoom,rooms,chooseJoinTeam,findBotSlot,snapshotFor,flameDamage,activateCloak,summon,teleportToSergeant,beginClassChange,updateClassChange,updateFlags,triggerRepulsor,beginHeal,getProjectile:()=>nextProjectileId};`;
const ctx={require,console,process,setTimeout,clearTimeout,Buffer,__dirname};vm.createContext(ctx);vm.runInContext(src,ctx,{filename:'server.test.js'});
const T=ctx.TEST;
function assert(c,m){if(!c)throw new Error(m)}
const dummy=id=>({playerId:id,roomCode:'',readyState:1,send(){}});

const room=T.makeRoom('TEST');
assert(T.teamMembers(room,'blue').length===4,'blue should start 4');
assert(T.teamMembers(room,'red').length===4,'red should start 4');
assert([...room.players.values()].every(x=>x.isBot),'room should start all bots');

// Fill the room with eight humans; preserve 4v4 invariant.
const humans=[];
for(let i=0;i<8;i++){
  const team=T.chooseJoinTeam(room);assert(team,'slot should exist');
  const ws=dummy('H'+i),p=T.replaceBotWithHuman(room,ws,team);assert(p&&!p.isBot,'human should replace bot');
  humans.push(p);assert(T.teamMembers(room,'blue').length===4&&T.teamMembers(room,'red').length===4,'4v4 invariant');
}
assert(!T.chooseJoinTeam(room),'ninth human should have no slot');
const leaving=humans[0],teamBefore=leaving.team,slotBefore=leaving.slotIndex;T.restoreBot(room,leaving);
assert([...room.players.values()].some(x=>x.isBot&&x.team===teamBefore&&x.slotIndex===slotBefore),'bot refills exact slot');

// Projectile/weapon balance.
assert(T.WEAPON_STATS.plasmaSMG.speed===168,'Plasma SMG speed should be 168 (-20%)');
assert(T.WEAPON_STATS.flamethrower.energyCost===4,'Flamethrower cost should be doubled to 4/burst');
assert(T.CLASSES.assassin.speed===42.5,'Assassin speed should be reduced 15%');
assert(T.WEAPON_STATS.physicalPistol.radius<T.WEAPON_STATS.plasmaSMG.radius,'pistol smaller than SMG');
assert(T.WEAPON_STATS.plasmaSMG.radius<T.WEAPON_STATS.medicGun.radius,'SMG smaller than carbine');
assert(T.WEAPON_STATS.medicGun.radius<T.WEAPON_STATS.rifle.radius,'carbine smaller than rifle');

// Bot rifle continuous hold cannot bypass cooldown.
const b=[...room.players.values()].find(x=>x.isBot);b.classId='footman';b.input.lmb=true;b.fireCd=0;b.rifleBurstLeft=0;b.rifleBurstTimer=0;
let start=T.getProjectile();for(let i=0;i<90;i++){T.updateTimers(b);T.fireRifle(room,b);}const botShots=T.getProjectile()-start;
assert(botShots>=3&&botShots<=12,`bot rifle cooldown unreasonable: ${botShots}`);

// Flamethrower costs Energy and favors low-Energy targets.
const f=T.makeEntity(room,'FLAME','blue',1,false);f.ready=true;f.classId='heavy';f.heavyPrimary='flamethrower';f.input.lmb=true;f.energy=200;const e0=f.energy;
for(let i=0;i<30;i++){T.updateTimers(f);T.fireFlame(room,f);}assert(f.energy<e0,'flamethrower consumes Energy');assert(f.energy<=188,'doubled flame cost should be substantial');
const low={energy:0,maxEnergy:100,flameStacks:0,flameStackAge:1};const high={energy:100,maxEnergy:100,flameStacks:0,flameStackAge:1};
const lowD=T.flameDamage(low,10),highD=T.flameDamage(high,10);assert(lowD>10&&highD<10&&lowD>highD,'flame should hurt low Energy more and high Energy less');

// Flag restrictions/costs.
const flagRoom=T.makeRoom('FLAG');
const assassin=T.makeEntity(flagRoom,'A','blue',0,false);assassin.ready=true;assassin.classId='assassin';assassin.energy=200;assassin.carryingFlagTeam='red';T.activateCloak(assassin);assert(assassin.cloakTimer===0,'flag carrier cannot cloak');
const sgt=T.makeEntity(flagRoom,'S','blue',1,false);sgt.ready=true;sgt.classId='sergeant';sgt.energy=200;
const carrier=T.makeEntity(flagRoom,'C','blue',2,false);carrier.ready=true;carrier.carryingFlagTeam='red';carrier.energy=200;flagRoom.players.set(sgt.id,sgt);flagRoom.players.set(carrier.id,carrier);
assert(T.summon(flagRoom,sgt,carrier.id),'summon flag carrier should succeed');assert(sgt.energy===50,'summoning flag carrier costs 150');
const sgt2=T.makeEntity(flagRoom,'S2','blue',3,false);sgt2.ready=true;sgt2.classId='sergeant';flagRoom.players.set(sgt2.id,sgt2);carrier.energy=300;carrier.maxEnergy=300;carrier.carryingFlagTeam='red';
assert(T.teleportToSergeant(flagRoom,carrier,sgt2.id),'flag carrier teleport should succeed');assert(carrier.energy===75,'flag carrier teleport costs 225');
carrier.energy=carrier.maxEnergy;carrier.carryingFlagTeam='red';const enemyFlag=flagRoom.flags.find(x=>x.team==='red');enemyFlag.carrierId=carrier.id;enemyFlag.dropped=false;T.beginClassChange(flagRoom,carrier,'medic');assert(!carrier.carryingFlagTeam&&enemyFlag.dropped,'class change drops flag immediately');

// Three captures win the round and reset enemy flag home each time.
const capRoom=T.makeRoom('CAP');const cap=T.makeEntity(capRoom,'CAP','blue',0,false);cap.ready=true;capRoom.players.set(cap.id,cap);const ownGen=capRoom.generators.find(g=>g.team==='blue');
for(let n=1;n<=3;n++){
  const rf=capRoom.flags.find(x=>x.team==='red');cap.carryingFlagTeam='red';rf.carrierId=cap.id;rf.dropped=false;cap.x=ownGen.x+ownGen.w/2;cap.y=ownGen.y+ownGen.h/2;T.updateFlags(capRoom);
  assert(capRoom.flagScore.blue===n,`capture score ${n}`);assert(rf.carrierId===null&&!rf.dropped&&rf.x===rf.spawnX,'enemy flag returns home');
}
assert(capRoom.winningTeam==='blue','three flag points should win round');

// Heal is press-to-start and costs 20% max Energy.
const healRoom=T.makeRoom('HEAL');const med=T.makeEntity(healRoom,'M','blue',0,false);med.ready=true;med.classId='medic';med.maxEnergy=150;med.energy=150;med.healCd=0;healRoom.players.set(med.id,med);
assert(T.beginHeal(healRoom,med),'heal press should start charge');assert(med.healCharging,'heal remains charging after press');med.input.mmb=false;
for(let i=0;i<61;i++)T.updateEntity(healRoom,med);
assert(!med.healCharging&&med.energy<=121,'heal should complete after press and cost 20% max Energy');

// Repulsor has two uses, then 30 seconds.
const repRoom=T.makeRoom('REP');const rep=T.makeEntity(repRoom,'R','blue',0,false);rep.ready=true;rep.classId='footman';rep.energy=300;rep.maxEnergy=300;rep.repulsorCharges=2;rep.repulsorCd=0;repRoom.players.set(rep.id,rep);
T.triggerRepulsor(repRoom,rep);assert(rep.repulsorCharges===1&&Math.abs(rep.repulsorCd-2.8)<.001,'first repulsor leaves one charge');
for(let i=0;i<85;i++)T.updateTimers(rep);assert(rep.repulsorCd===0,'short repulsor cooldown should finish');
T.triggerRepulsor(repRoom,rep);assert(rep.repulsorCharges===0&&Math.abs(rep.repulsorCd-30)<.001,'second repulsor starts 30s cooldown');
for(let i=0;i<901;i++)T.updateTimers(rep);assert(rep.repulsorCharges===2&&rep.repulsorCd===0,'repulsor charges refresh after 30s');

// Both sides' bots should navigate/explore rather than stay pinned behind walls.
const navRoom=T.makeRoom('NAV');
for(const team of ['blue','red']){
  const bot=T.teamMembers(navRoom,team)[0];
  bot.x=team==='blue'?480:1320;bot.y=330;bot.vx=bot.vy=0;bot.aiLastX=bot.x;bot.aiLastY=bot.y;
  const sx=bot.x,sy=bot.y;
  for(let i=0;i<240;i++)T.updateEntity(navRoom,bot);
  const moved=Math.hypot(bot.x-sx,bot.y-sy);assert(moved>20,`${team} bot should explore/unstick, moved ${moved.toFixed(1)}`);
}

// Radar still five seconds and roster remains 4v4.
const viewer=[...room.players.values()].find(x=>!x.isBot);viewer.ready=true;viewer.alive=true;viewer.commandQueue.push({kind:'radar'});T.processCommands(room,viewer);assert(viewer.radarTimer===5,'radar should be 5 seconds');
const snap=T.snapshotFor(room,viewer);assert(snap.roster.blue.length===4&&snap.roster.red.length===4,'snapshot roster 4/4');assert(snap.flagWinScore===3,'snapshot carries CTF target');

console.log(JSON.stringify({ok:true,botRifleShotsIn3s:botShots,plasmaSmgSpeed:T.WEAPON_STATS.plasmaSMG.speed,flamethrowerCost:T.WEAPON_STATS.flamethrower.energyCost,flameLowEnergyDamage:lowD,flameHighEnergyDamage:highD,repulsorCharges:rep.repulsorCharges,flagWinScore:snap.flagWinScore},null,2));
