const http=require('http');
const fs=require('fs');
const path=require('path');
const {WebSocketServer,WebSocket}=require('ws');

const PORT=process.env.PORT||3000;
const TICK_RATE=30;
const DT=1/TICK_RATE;
const WORLD={w:1800,h:1100};
const VISION_RANGE=520;
let nextHumanId=1;
let nextProjectileId=1;
let nextGrenadeId=1;
let nextEffectId=1;
const rooms=new Map();

const BASE_FLOORS=[
  {x:40,y:330,w:400,h:440,team:'blue',label:'BLUE BASE'},
  {x:1360,y:330,w:400,h:440,team:'red',label:'RED BASE'}
];

const WALLS=[
  // BLUE BASE — large enclosed shell with one wide east-facing entrance.
  {x:40,y:330,w:400,h:20,kind:'base',team:'blue'},
  {x:40,y:750,w:400,h:20,kind:'base',team:'blue'},
  {x:40,y:350,w:20,h:400,kind:'base',team:'blue'},
  {x:420,y:350,w:20,h:145,kind:'base',team:'blue'},
  {x:420,y:605,w:20,h:145,kind:'base',team:'blue'},

  // BLUE GENERATOR BRACKET.
  // Open toward the WEST/rear wall. Attackers entering from the east must
  // route above or below this U-shaped enclosure to reach the rear pocket.
  {x:120,y:455,w:116,h:20,kind:'base',team:'blue'},
  {x:120,y:625,w:116,h:20,kind:'base',team:'blue'},
  {x:236,y:455,w:20,h:190,kind:'base',team:'blue'},

  // RED BASE — exact mirror with one wide west-facing entrance.
  {x:1360,y:330,w:400,h:20,kind:'base',team:'red'},
  {x:1360,y:750,w:400,h:20,kind:'base',team:'red'},
  {x:1740,y:350,w:20,h:400,kind:'base',team:'red'},
  {x:1360,y:350,w:20,h:145,kind:'base',team:'red'},
  {x:1360,y:605,w:20,h:145,kind:'base',team:'red'},

  // RED GENERATOR BRACKET — exact mirror.
  // Open toward the EAST/rear wall.
  {x:1564,y:455,w:116,h:20,kind:'base',team:'red'},
  {x:1564,y:625,w:116,h:20,kind:'base',team:'red'},
  {x:1544,y:455,w:20,h:190,kind:'base',team:'red'},

  // WEST UPPER RICOCHET COURT — slightly smaller pieces = wider gaps.
  {x:480,y:242,w:132,h:22,kind:'ricochet'},
  {x:628,y:292,w:22,h:104,kind:'ricochet'},
  {x:506,y:408,w:90,h:20,kind:'ricochet'},
  {x:442,y:322,w:24,h:74,kind:'cover'},

  // WEST LOWER RICOCHET COURT.
  {x:480,y:836,w:132,h:22,kind:'ricochet'},
  {x:628,y:704,w:22,h:104,kind:'ricochet'},
  {x:506,y:672,w:90,h:20,kind:'ricochet'},
  {x:442,y:704,w:24,h:74,kind:'cover'},

  // EAST UPPER RICOCHET COURT.
  {x:1188,y:242,w:132,h:22,kind:'ricochet'},
  {x:1150,y:292,w:22,h:104,kind:'ricochet'},
  {x:1204,y:408,w:90,h:20,kind:'ricochet'},
  {x:1334,y:322,w:24,h:74,kind:'cover'},

  // EAST LOWER RICOCHET COURT.
  {x:1188,y:836,w:132,h:22,kind:'ricochet'},
  {x:1150,y:704,w:22,h:104,kind:'ricochet'},
  {x:1204,y:672,w:90,h:20,kind:'ricochet'},
  {x:1334,y:704,w:24,h:74,kind:'cover'},

  // CENTRAL DUELING COURT — compact fins with more breathing room.
  {x:748,y:338,w:108,h:20,kind:'ricochet'},
  {x:944,y:338,w:108,h:20,kind:'ricochet'},
  {x:748,y:742,w:108,h:20,kind:'ricochet'},
  {x:944,y:742,w:108,h:20,kind:'ricochet'},

  {x:716,y:392,w:20,h:94,kind:'ricochet'},
  {x:1064,y:392,w:20,h:94,kind:'ricochet'},
  {x:716,y:614,w:20,h:94,kind:'ricochet'},
  {x:1064,y:614,w:20,h:94,kind:'ricochet'},

  // Inner pillars.
  {x:820,y:478,w:24,h:62,kind:'cover'},
  {x:956,y:478,w:24,h:62,kind:'cover'},
  {x:820,y:560,w:24,h:62,kind:'cover'},
  {x:956,y:560,w:24,h:62,kind:'cover'},

  // Mid-lane cover islands.
  {x:548,y:524,w:50,h:50,kind:'crate'},
  {x:662,y:532,w:60,h:38,kind:'cover'},
  {x:1078,y:532,w:60,h:38,kind:'cover'},
  {x:1202,y:524,w:50,h:50,kind:'crate'},

  // Outer-lane anchors.
  {x:720,y:166,w:74,h:24,kind:'cover'},
  {x:1006,y:166,w:74,h:24,kind:'cover'},
  {x:720,y:910,w:74,h:24,kind:'cover'},
  {x:1006,y:910,w:74,h:24,kind:'cover'},

  // Small isolated crates.
  {x:584,y:608,w:42,h:42,kind:'crate'},
  {x:1174,y:450,w:42,h:42,kind:'crate'}
];

const GENERATOR_TEMPLATE=[
  {
    team:'blue',x:150,y:505,w:60,h:90,hp:1200,maxHp:1200,destroyed:false,
    // Weak point faces INWARD toward the base entrance / battlefield.
    backDoor:{x:202,y:528,w:12,h:44,side:'east'},
    interior:{x:60,y:350,w:360,h:400}
  },
  {
    team:'red',x:1590,y:505,w:60,h:90,hp:1200,maxHp:1200,destroyed:false,
    // Weak point faces INWARD toward the base entrance / battlefield.
    backDoor:{x:1586,y:528,w:12,h:44,side:'west'},
    interior:{x:1380,y:350,w:360,h:400}
  }
];

const WEAPON_STATS = {
  rifle:{
    damage:28,
    speed:194.4,
    burstCount:3,
    burstGap:.18,
    cooldown:.70
  },
  machinegun:{
    damage:22.5,
    speed:204,
    fireInterval:.114,
    spinUp:.75,
    spread:.05
  },
  blaster:{
    damage:34,
    speed:132,
    energyCostPct:.075,
    cooldown:1.0,
    energyMult:2.0,
    hpMult:.5,
    life:1.8,
    bounces:1,
    regenSlowDuration:3,
    regenSlowMult:.35
  },
  cannon:{
    speed:104,
    energyCostPct:.50,
    chargeTime:2.0,
    cooldown:2.2,
    life:2.64,
    bounces:2,
    radius:10,
    explosionRadius:68,
    explosionDamage:120,
    energyMult:2.6,
    hpMult:.35
  },
  plasmaPistol:{
    damage:24,
    speed:200,
    energyCost:8,
    cooldown:.55,
    energyMult:1.5,
    hpMult:.6,
    radius:2.2
  },
  plasmaSMG:{
    damage:15,
    speed:210,
    energyCost:3.5,
    burstCount:4,
    burstGap:.08,
    burstCooldown:.65,
    energyMult:1.45,
    hpMult:.58,
    radius:1.35,
    life:.868,
    spread:.028
  },
  physicalPistol:{
    damage:32,
    speed:205,
    cooldown:.48,
    radius:2.4,
    life:1.15
  },
  knife:{
    damage:95,
    range:29.64,
    cooldown:.65,
    energyMult:.7,
    hpMult:1.5
  },
  zapper:{
    damage:12,
    speed:240,
    energyCost:15,
    cooldown:10.0,
    range:185,
    life:.58,
    energyMult:1.15,
    hpMult:.35,
    radius:3,
    slowDuration:3,
    zapRechargeExtra:3
  },
  medicGun:{
    damage:20,
    speed:188,
    burstCount:2,
    burstGap:.22,
    cooldown:1.1
  }
};

const CLASSES = {
  footman: {
    name:'Footman', maxHp:175, maxEnergy:150, speed:47, accel:95, drag:2.6, energyRegen:12, weight:'Medium',
    weapon1:{name:'Physical Rifle', kind:'rifle'},
    weapon2:{name:'Energy Blaster', kind:'blaster'},
    weapon3:{name:'Frag Grenade', kind:'grenade'}
  },
  heavy: {
    name:'Heavy', maxHp:200, maxEnergy:200, speed:34, accel:72, drag:2.9, energyRegen:10, weight:'Heavy',
    weapon1:{name:'Machine Gun', kind:'machinegun'},
    weapon2:{name:'Energy Cannon', kind:'cannon'},
    weapon3:{name:'Frag Grenade', kind:'grenade'}
  },
  assassin: {
    name:'Assassin', maxHp:125, maxEnergy:200, speed:49.6, accel:125, drag:2.3, energyRegen:14, weight:'Light', radius:9.6,
    weapon1:{name:'Plasma SMG', kind:'plasmaSMG'},
    weapon2:{name:'Knife', kind:'knife'},
    weapon3:{name:'Zapper', kind:'zapper'}
  },
  medic: {
    name:'Medic', maxHp:150, maxEnergy:150, speed:50, accel:102, drag:2.5, energyRegen:13, weight:'Medium',
    weapon1:{name:'Light Carbine', kind:'medicGun'},
    weapon2:{name:'Plasma Pistol', kind:'plasmaPistol'},
    weapon3:{name:'Heal Pulse', kind:'heal'}
  }
};

function clamp(v,a,b){return Math.max(a,Math.min(b,v));}
function rand(a,b){return a+Math.random()*(b-a);}
function distance(a,b){return Math.hypot(a.x-b.x,a.y-b.y);}
function approachAngle(current,target,maxStep){
  let diff=((target-current+Math.PI)%(Math.PI*2)+Math.PI*2)%(Math.PI*2)-Math.PI;
  if(Math.abs(diff)<=maxStep)return target;
  return current+Math.sign(diff)*maxStep;
}
function circleHitsRect(x,y,r,rect){
  const nx=clamp(x,rect.x,rect.x+rect.w),ny=clamp(y,rect.y,rect.y+rect.h);
  const dx=x-nx,dy=y-ny;
  return dx*dx+dy*dy<r*r;
}
function circleHitsGenerator(x,y,r,gen){
  const nx=clamp(x,gen.x,gen.x+gen.w),ny=clamp(y,gen.y,gen.y+gen.h);
  const dx=x-nx,dy=y-ny;
  return dx*dx+dy*dy<r*r;
}
function hitsWall(x,y,r=0){
  for(const w of WALLS)if(circleHitsRect(x,y,r,w))return w;
  return null;
}
function hitsAnyGenerator(room,x,y,r=0){
  for(const g of room.generators)if(!g.destroyed&&circleHitsGenerator(x,y,r,g))return g;
  return null;
}
function moveWithWalls(room,ent,dx,dy){
  let collided=false;
  const ox=ent.x,oy=ent.y;
  ent.x+=dx;
  if(hitsWall(ent.x,ent.y,ent.r)||hitsAnyGenerator(room,ent.x,ent.y,ent.r)){
    ent.x=ox;
    if('vx'in ent)ent.vx*=.12;
    collided=true;
  }
  ent.y+=dy;
  if(hitsWall(ent.x,ent.y,ent.r)||hitsAnyGenerator(room,ent.x,ent.y,ent.r)){
    ent.y=oy;
    if('vy'in ent)ent.vy*=.12;
    collided=true;
  }
  ent.x=clamp(ent.x,28,WORLD.w-28);
  ent.y=clamp(ent.y,28,WORLD.h-28);
  return collided;
}
function segmentHitsRect(x1,y1,x2,y2,r){
  let t0=0,t1=1;
  const dx=x2-x1,dy=y2-y1;
  const tests=[[-dx,x1-r.x],[dx,r.x+r.w-x1],[-dy,y1-r.y],[dy,r.y+r.h-y1]];
  for(const [p,q]of tests){
    if(Math.abs(p)<1e-9){if(q<0)return false;}
    else{
      const t=q/p;
      if(p<0){if(t>t1)return false;if(t>t0)t0=t;}
      else{if(t<t0)return false;if(t<t1)t1=t;}
    }
  }
  return true;
}
function lineBlocked(x1,y1,x2,y2){
  for(const w of WALLS)if(segmentHitsRect(x1,y1,x2,y2,w))return true;
  return false;
}
function pointRectDistance(x,y,r){
  const nx=clamp(x,r.x,r.x+r.w),ny=clamp(y,r.y,r.y+r.h);
  return Math.hypot(x-nx,y-ny);
}
function pointInRect(x,y,r){return x>=r.x&&x<=r.x+r.w&&y>=r.y&&y<=r.y+r.h;}

function deepClone(v){return JSON.parse(JSON.stringify(v));}
function teamBody(team){return team==='blue'?'blue':'red';}
function opposingTeam(team){return team==='blue'?'red':'blue';}

function spawnFor(room,team,r,index=0){
  const candidates=team==='blue'
    ? [[285,550],[330,505],[330,595],[375,550],[285,500]]
    : [[1515,550],[1470,505],[1470,595],[1425,550],[1515,500]];
  for(let off=0;off<candidates.length;off++){
    const p=candidates[(index+off)%candidates.length];
    if(!hitsWall(p[0],p[1],r)&&!hitsAnyGenerator(room,p[0],p[1],r))return{x:p[0],y:p[1]};
  }
  return team==='blue'?{x:285,y:550}:{x:1515,y:550};
}

function classStats(id){return CLASSES[id]||CLASSES.footman;}
function applyClass(ent,id,healFull=false){
  const cls=classStats(id);
  ent.classId=CLASSES[id]?id:'footman';
  ent.maxHp=cls.maxHp;
  ent.maxEnergy=cls.maxEnergy;
  ent.energyRegen=cls.energyRegen;
  ent.maxSpeed=cls.speed;
  ent.accel=cls.accel;
  ent.drag=cls.drag;
  ent.r=cls.radius??12;
  if(healFull){
    ent.hp=ent.maxHp;
    ent.energy=ent.maxEnergy;
  }else{
    ent.hp=Math.min(ent.hp??ent.maxHp,ent.maxHp);
    ent.energy=Math.min(ent.energy??ent.maxEnergy,ent.maxEnergy);
  }
}

function makeEntity(room,id,team,isBot=false,index=0){
  const sp=spawnFor(room,team,12,index);
  const e={
    id,team,isBot,ready:isBot,
    x:sp.x,y:sp.y,r:12,classId:'footman',pendingClassId:'footman',
    hp:175,maxHp:175,energy:150,maxEnergy:150,lastHit:99,energyRegen:12,
    vx:0,vy:0,angle:team==='blue'?0:Math.PI,
    maxSpeed:47,accel:95,drag:2.6,deadTimer:0,alive:true,
    fireCd:0,rifleBurstLeft:0,rifleBurstTimer:0,
    plasmaSmgBurstLeft:0,plasmaSmgBurstTimer:0,
    blasterCd:0,shotgunCd:0,footmanSecondary:'blaster',assassinSecondary:'knife',
    grenadeCd:0,medicPistolCd:0,healCd:0,
    machineCharge:0,machineBurstTimer:0,machineCd:0,
    cannonCharge:0,cannonCd:0,cannonCharging:false,cannonStartX:0,cannonStartY:0,cannonClickLatch:false,
    knifeAnim:0,utilityCd:0,
    healCharge:0,healStartX:0,healStartY:0,
    repulsorCd:0,slowTimer:0,zapTimer:0,zapRechargeExtra:0,regenSlowTimer:0,
    knockbackTimer:0,bounty:0,streak:0,
    input:{strafe:0,forward:0,aim:team==='blue'?0:Math.PI,lmb:false,rmb:false,mmb:false,sprint:false},
    previousInput:{rmb:false},
    commandQueue:[],
    supportPhase:rand(0,Math.PI*2)
  };
  applyClass(e,'footman',true);
  return e;
}

function makeRoom(code){
  const room={
    code,clients:new Map(),players:new Map(),
    generators:deepClone(GENERATOR_TEMPLATE),
    bullets:[],grenades:[],healJobs:[],effects:[],corpses:[],
    teamRadar:{blue:0,red:0},
    winningTeam:null,postVictoryTimer:0,matchFrozen:false,
    tick:0
  };
  // One support Footman per side. They use the same weapon stats as humans.
  room.players.set('BLUE_SUPPORT',makeEntity(room,'BLUE_SUPPORT','blue',true,1));
  room.players.set('RED_SUPPORT',makeEntity(room,'RED_SUPPORT','red',true,1));
  rooms.set(code,room);
  return room;
}

function makeRoomCode(){
  const chars='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  for(let tries=0;tries<1000;tries++){
    let code='';
    for(let i=0;i<4;i++)code+=chars[Math.floor(Math.random()*chars.length)];
    if(!rooms.has(code))return code;
  }
  throw new Error('Unable to allocate room code');
}
function send(ws,obj){if(ws.readyState===WebSocket.OPEN)ws.send(JSON.stringify(obj));}
function leaveRoom(ws){
  if(!ws.roomCode)return;
  const room=rooms.get(ws.roomCode);
  if(!room){ws.roomCode='';return;}
  const pid=room.clients.get(ws);
  room.clients.delete(ws);
  if(pid)room.players.delete(pid);
  if(room.clients.size===0)rooms.delete(room.code);
  ws.roomCode='';
}

function livingTeam(room,team){
  return [...room.players.values()].filter(p=>p.team===team&&p.alive&&p.ready);
}
function teamCanSee(room,team,target){
  if(!target)return false;
  if(target.team===team)return true;
  if(room.teamRadar[team]>0)return true;
  for(const src of livingTeam(room,team)){
    if(Math.hypot(target.x-src.x,target.y-src.y)>VISION_RANGE)continue;
    if(!lineBlocked(src.x,src.y,target.x,target.y))return true;
  }
  return false;
}
function nearestVisibleEnemy(room,observer){
  let best=null,bestD=Infinity;
  for(const q of room.players.values()){
    if(!q.alive||!q.ready||q.team===observer.team)continue;
    if(!teamCanSee(room,observer.team,q))continue;
    const d=distance(observer,q);
    if(d<bestD){bestD=d;best=q;}
  }
  return best;
}

function energyDamage(target,dmg,opts={}){
  if(!target.alive)return;
  const energyPct=clamp(target.energy/target.maxEnergy,0,1);
  const blockedBase=dmg*energyPct;
  const blockedDrain=blockedBase*(opts.energyMult??1);
  const hpDamage=(dmg-blockedBase)*(opts.hpMult??1);
  target.energy=Math.max(0,target.energy-blockedDrain);
  target.hp=Math.max(0,target.hp-hpDamage);
  target.lastHit=0;
  if(opts.slowDuration>0){
    target.slowTimer=Math.max(target.slowTimer,opts.slowDuration);
    if(opts.zapRechargeExtra>0)target.zapTimer=Math.max(target.zapTimer,opts.slowDuration);
  }
  if(opts.zapRechargeExtra>0)target.zapRechargeExtra=Math.max(target.zapRechargeExtra,opts.zapRechargeExtra);
  if(opts.regenSlowDuration>0)target.regenSlowTimer=Math.max(target.regenSlowTimer,opts.regenSlowDuration);
}

function killEntity(room,e){
  if(!e.alive)return;
  e.alive=false;e.hp=0;e.deadTimer=4;e.vx=e.vy=0;
  room.corpses.push({
    id:'C'+(++nextEffectId),ownerId:e.id,team:e.team,classId:e.classId,
    x:e.x,y:e.y,angle:e.angle,r:e.r,life:4
  });
}
function respawnEntity(room,e){
  applyClass(e,e.pendingClassId||e.classId,true);
  e.classId=e.pendingClassId||e.classId;
  const teamMembers=[...room.players.values()].filter(x=>x.team===e.team);
  const sp=spawnFor(room,e.team,e.r,Math.max(0,teamMembers.indexOf(e)));
  e.x=sp.x;e.y=sp.y;e.vx=e.vy=0;e.alive=true;e.deadTimer=0;e.lastHit=99;
  e.slowTimer=e.zapTimer=e.zapRechargeExtra=e.regenSlowTimer=e.knockbackTimer=0;
  e.fireCd=e.blasterCd=e.shotgunCd=e.grenadeCd=e.medicPistolCd=e.healCd=0;
  e.machineCharge=e.machineBurstTimer=e.machineCd=0;
  e.cannonCharge=e.cannonCd=0;e.cannonCharging=false;e.cannonClickLatch=false;
  e.utilityCd=0;e.healCharge=0;e.repulsorCd=0;
  e.rifleBurstLeft=e.plasmaSmgBurstLeft=0;
}

function isGeneratorBackDoorHit(gen,x,y,weaponKind){
  if(!['cannon','grenade','zapper'].includes(weaponKind))return false;
  if(!pointInRect(x,y,gen.interior))return false;
  const cy=gen.y+gen.h/2;
  if(Math.abs(y-cy)>70)return false;
  if(gen.backDoor.side==='west')return x<=gen.x+gen.w*.45;
  return x>=gen.x+gen.w*.55;
}
function damageGenerator(room,gen,rawDamage,weaponKind,hitX,hitY){
  if(!gen||gen.destroyed||rawDamage<=0)return;
  let mult=weaponKind==='knife'?.10:.25;
  if(isGeneratorBackDoorHit(gen,hitX,hitY,weaponKind))mult*=3;
  gen.hp=Math.max(0,gen.hp-rawDamage*mult);
  if(gen.hp<=0&&!gen.destroyed){
    gen.destroyed=true;
    room.winningTeam=opposingTeam(gen.team);
    room.postVictoryTimer=20;
    room.effects.push({id:'E'+(++nextEffectId),kind:'cannon',x:gen.x+gen.w/2,y:gen.y+gen.h/2,r:120,life:.65,maxLife:.65});
  }
}

function addBullet(room,owner,angle,speed,damage,meta={}){
  room.bullets.push({
    id:'B'+(++nextProjectileId),ownerId:owner.id,team:owner.team,
    x:owner.x+Math.cos(angle)*(owner.r+8),y:owner.y+Math.sin(angle)*(owner.r+8),
    startX:owner.x,startY:owner.y,vx:Math.cos(angle)*speed,vy:Math.sin(angle)*speed,
    r:meta.r??4,damage,type:meta.type??'physical',life:meta.life??1.8,
    energyMult:meta.energyMult??((meta.type??'physical')==='physical'?.60:1),
    hpMult:meta.hpMult??1,
    color:meta.color??null,longBeam:meta.longBeam??false,
    fade:meta.fade??false,falloffStart:meta.falloffStart??0,falloffEnd:meta.falloffEnd??9999,minScale:meta.minScale??1,
    bouncesLeft:meta.bouncesLeft??0,
    plasma:meta.plasma??false,plasmaSMG:meta.plasmaSMG??false,zapper:meta.zapper??false,
    slowDuration:meta.slowDuration??0,zapRechargeExtra:meta.zapRechargeExtra??0,
    regenSlowDuration:meta.regenSlowDuration??0,
    cannonBall:meta.cannonBall??false,explodeRadius:meta.explodeRadius??0,explodeDamage:meta.explodeDamage??0,
    weaponKind:meta.weaponKind??'projectile'
  });
}
function bulletScale(b){
  if(!b.fade)return 1;
  const d=Math.hypot(b.x-b.startX,b.y-b.startY);
  if(d<=b.falloffStart)return 1;
  if(d>=b.falloffEnd)return b.minScale;
  const t=(d-b.falloffStart)/(b.falloffEnd-b.falloffStart);
  return 1-(1-b.minScale)*t;
}

function explodeCannon(room,b){
  const radius=b.explodeRadius||68,damage=b.explodeDamage||120;
  room.effects.push({id:'E'+(++nextEffectId),kind:'cannon',x:b.x,y:b.y,r:radius,life:.34,maxLife:.34});
  const gen=room.generators.find(g=>g.team!==b.team);
  if(gen&&!gen.destroyed){
    const gd=pointRectDistance(b.x,b.y,gen);
    if(gd<=radius&&!lineBlocked(b.x,b.y,gen.x+gen.w/2,gen.y+gen.h/2)){
      const scale=1-clamp(gd/radius,0,1)*.45;
      damageGenerator(room,gen,damage*scale,'cannon',b.x,b.y);
    }
  }
  for(const p of room.players.values()){
    if(!p.alive||p.team===b.team)continue;
    const d=Math.hypot(p.x-b.x,p.y-b.y);
    if(d<=radius+p.r&&!lineBlocked(b.x,b.y,p.x,p.y)){
      const scale=1-clamp(d/radius,0,1)*.45;
      energyDamage(p,damage*scale,{energyMult:WEAPON_STATS.cannon.energyMult,hpMult:WEAPON_STATS.cannon.hpMult});
      if(p.hp<=0)killEntity(room,p);
    }
  }
}

function throwGrenade(room,owner){
  const speed=185+(owner.input.sprint?22:0);
  room.grenades.push({
    id:'G'+(++nextGrenadeId),ownerId:owner.id,team:owner.team,
    x:owner.x+Math.cos(owner.angle)*(owner.r+6),y:owner.y+Math.sin(owner.angle)*(owner.r+6),
    vx:Math.cos(owner.angle)*speed+owner.vx,vy:Math.sin(owner.angle)*speed+owner.vy,
    r:5,fuse:2.5,playerBounceCd:0,embeddedGeneratorId:null
  });
}

function grenadeEntersWeak(g,gen,nextX,nextY){
  if(!g||!gen||gen.destroyed||g.embeddedGeneratorId)return false;
  const inward=gen.backDoor.side==='west'?g.vx>0:g.vx<0;
  if(!inward)return false;
  const panel=gen.backDoor;
  const nx=clamp(nextX,panel.x,panel.x+panel.w),ny=clamp(nextY,panel.y,panel.y+panel.h);
  const dx=nextX-nx,dy=nextY-ny;
  return dx*dx+dy*dy<=g.r*g.r;
}
function embedGrenade(g,gen,y){
  g.embeddedGeneratorId=gen.team;
  g.x=gen.backDoor.side==='west'?gen.x+g.r+4:gen.x+gen.w-g.r-4;
  g.y=clamp(y,gen.y+g.r+3,gen.y+gen.h-g.r-3);
  g.vx=g.vy=0;g.playerBounceCd=999;
}

function triggerRepulsor(room,e){
  if(!e.alive||e.repulsorCd>0||e.energy<75)return;
  e.energy-=75;e.repulsorCd=2.8;
  room.effects.push({id:'E'+(++nextEffectId),kind:'repulsor',x:e.x,y:e.y,r:155,life:.34,maxLife:.34});
  const radius=155,enemyImpulse=205,projectileImpulse=310;
  for(const q of room.players.values()){
    if(!q.alive||q.team===e.team)continue;
    let dx=q.x-e.x,dy=q.y-e.y,d=Math.hypot(dx,dy);
    if(d<=0||d>radius)continue;
    const nx=dx/d,ny=dy/d,strength=enemyImpulse*(1-d/radius*.55);
    q.vx=nx*strength+q.vx*.2;q.vy=ny*strength+q.vy*.2;q.knockbackTimer=.42;
    q.healCharge=0;q.cannonCharging=false;
  }
  for(const b of room.bullets){
    let dx=b.x-e.x,dy=b.y-e.y,d=Math.hypot(dx,dy);
    if(d<=0||d>radius)continue;
    const nx=dx/d,ny=dy/d,current=Math.hypot(b.vx,b.vy);
    const outward=Math.max(projectileImpulse*(1-d/radius*.45),current*.65);
    b.vx=b.vx*.25+nx*outward;b.vy=b.vy*.25+ny*outward;
  }
  for(const g of room.grenades){
    if(g.embeddedGeneratorId)continue;
    let dx=g.x-e.x,dy=g.y-e.y,d=Math.hypot(dx,dy);
    if(d<=0||d>radius)continue;
    const nx=dx/d,ny=dy/d,strength=projectileImpulse*(1-d/radius*.35);
    g.vx+=nx*strength;g.vy+=ny*strength;g.playerBounceCd=.08;
  }
}

function processCommands(room,e){
  while(e.commandQueue.length){
    const cmd=e.commandQueue.shift();
    if(cmd==='swap'){
      if(e.classId==='footman')e.footmanSecondary=e.footmanSecondary==='blaster'?'shotgun':'blaster';
      if(e.classId==='assassin')e.assassinSecondary=e.assassinSecondary==='knife'?'physicalPistol':'knife';
    }else if(cmd==='repulsor'){
      triggerRepulsor(room,e);
    }else if(cmd==='radar'){
      if(e.alive)room.teamRadar[e.team]=2;
    }else if(cmd==='switchTeam'){
      e.team=opposingTeam(e.team);
      const teammates=[...room.players.values()].filter(x=>x.team===e.team);
      const sp=spawnFor(room,e.team,e.r,teammates.indexOf(e));
      e.x=sp.x;e.y=sp.y;e.vx=e.vy=0;e.hp=e.maxHp;e.energy=e.maxEnergy;
      room.bullets.length=0;room.grenades.length=0;
    }
  }
}

function updateWeaponTimers(e){
  const keys=['fireCd','blasterCd','shotgunCd','grenadeCd','medicPistolCd','healCd','machineCd','machineBurstTimer','cannonCd','utilityCd','repulsorCd','rifleBurstTimer','plasmaSmgBurstTimer'];
  for(const k of keys)e[k]=Math.max(0,(e[k]||0)-DT);
  e.knifeAnim=Math.max(0,(e.knifeAnim||0)-DT);
}

function firePrimary(room,e){
  const kind=CLASSES[e.classId].weapon1.kind;
  if(kind==='rifle'){
    const w=WEAPON_STATS.rifle;
    if(e.input.lmb&&e.fireCd<=0&&e.rifleBurstLeft===0){e.rifleBurstLeft=w.burstCount;e.rifleBurstTimer=0;}
    if(e.rifleBurstLeft>0&&e.rifleBurstTimer<=0){
      addBullet(room,e,e.angle,w.speed,w.damage,{type:'physical',color:'#ffe37b',weaponKind:'rifle'});
      e.rifleBurstLeft--;e.rifleBurstTimer=e.rifleBurstLeft>0?w.burstGap:0;
      if(e.rifleBurstLeft===0)e.fireCd=w.cooldown;
    }
  }else if(kind==='machinegun'){
    const w=WEAPON_STATS.machinegun;
    const nearlyStill=Math.hypot(e.vx,e.vy)<8;
    if(e.input.lmb&&e.machineCd<=0&&e.machineCharge<w.spinUp&&nearlyStill)e.machineCharge+=DT;
    else if(!e.input.lmb||!nearlyStill)e.machineCharge=Math.max(0,e.machineCharge-DT*1.8);
    if(e.machineCharge>=w.spinUp&&e.input.lmb&&e.machineBurstTimer<=0){
      addBullet(room,e,e.angle+rand(-w.spread,w.spread),w.speed,w.damage,{type:'physical',color:'#ffe37b',weaponKind:'machinegun'});
      e.machineBurstTimer=w.fireInterval;
    }
  }else if(kind==='plasmaSMG'){
    const w=WEAPON_STATS.plasmaSMG;
    if(e.input.lmb&&e.fireCd<=0&&e.plasmaSmgBurstLeft===0&&e.energy>=w.energyCost){
      e.plasmaSmgBurstLeft=w.burstCount;e.plasmaSmgBurstTimer=0;
    }
    if(e.plasmaSmgBurstLeft>0&&e.plasmaSmgBurstTimer<=0){
      if(e.energy>=w.energyCost){
        e.energy-=w.energyCost;
        addBullet(room,e,e.angle+rand(-w.spread,w.spread),w.speed,w.damage,{
          type:'energy',color:'#54ff78',energyMult:w.energyMult,hpMult:w.hpMult,r:w.radius,life:w.life,plasma:true,plasmaSMG:true,weaponKind:'plasmaSMG'
        });
        e.plasmaSmgBurstLeft--;e.plasmaSmgBurstTimer=e.plasmaSmgBurstLeft>0?w.burstGap:0;
        if(e.plasmaSmgBurstLeft===0)e.fireCd=w.burstCooldown;
      }else{e.plasmaSmgBurstLeft=0;e.fireCd=w.burstCooldown;}
    }
  }else if(kind==='medicGun'){
    const w=WEAPON_STATS.medicGun;
    if(e.input.lmb&&e.fireCd<=0&&e.rifleBurstLeft===0){
      e.rifleBurstLeft=w.burstCount;e.rifleBurstTimer=0;e.fireCd=w.cooldown;
    }
    if(e.rifleBurstLeft>0&&e.rifleBurstTimer<=0){
      addBullet(room,e,e.angle,w.speed,w.damage,{type:'physical',color:'#ffe37b',weaponKind:'medicGun'});
      e.rifleBurstLeft--;e.rifleBurstTimer=w.burstGap;
    }
  }
}

function fireSecondary(room,e){
  const kind=CLASSES[e.classId].weapon2.kind;
  if(kind==='blaster'){
    if(e.footmanSecondary==='shotgun'){
      if(e.input.rmb&&e.shotgunCd<=0){
        for(let i=0;i<9;i++){
          const spread=(i-4)*.028+rand(-.008,.008);
          addBullet(room,e,e.angle+spread,176,18,{type:'physical',color:'#ffd98a',r:3,life:.62,fade:true,falloffStart:22,falloffEnd:116,minScale:.04,weaponKind:'shotgun'});
        }
        e.shotgunCd=.90;
      }
    }else{
      const w=WEAPON_STATS.blaster,cost=e.maxEnergy*w.energyCostPct;
      if(e.input.rmb&&e.blasterCd<=0&&e.energy>=cost){
        e.energy-=cost;
        addBullet(room,e,e.angle,w.speed,w.damage,{
          type:'energy',color:'#74d8ff',longBeam:true,energyMult:w.energyMult,hpMult:w.hpMult,
          regenSlowDuration:w.regenSlowDuration,bouncesLeft:w.bounces,life:w.life,weaponKind:'blaster'
        });
        e.blasterCd=w.cooldown;
      }
    }
  }else if(kind==='cannon'){
    const w=WEAPON_STATS.cannon,cost=e.maxEnergy*w.energyCostPct;
    const rising=e.input.rmb&&!e.previousInput.rmb;
    if(rising&&!e.cannonCharging&&e.cannonCd<=0&&e.energy>=cost){
      e.cannonCharging=true;e.cannonCharge=0;e.cannonStartX=e.x;e.cannonStartY=e.y;
    }
    if(e.cannonCharging){
      const moved=Math.hypot(e.x-e.cannonStartX,e.y-e.cannonStartY)>1.5;
      if(moved||e.cannonCd>0||e.energy<cost){e.cannonCharging=false;e.cannonCharge=0;}
      else{
        e.cannonCharge+=DT;
        if(e.cannonCharge>=w.chargeTime){
          e.energy-=cost;e.cannonCharging=false;e.cannonCharge=0;e.cannonCd=w.cooldown;
          addBullet(room,e,e.angle,w.speed,0,{
            type:'energy',color:'#ff4c4c',r:w.radius,life:w.life,bouncesLeft:w.bounces,cannonBall:true,
            explodeRadius:w.explosionRadius,explodeDamage:w.explosionDamage,weaponKind:'cannon'
          });
        }
      }
    }
  }else if(kind==='knife'){
    if(e.assassinSecondary==='physicalPistol'){
      const w=WEAPON_STATS.physicalPistol;
      if(e.input.rmb&&e.utilityCd<=0){
        addBullet(room,e,e.angle,w.speed,w.damage,{type:'physical',color:'#ffd98a',r:w.radius,life:w.life,weaponKind:'physicalPistol'});
        e.utilityCd=w.cooldown;
      }
    }else{
      const w=WEAPON_STATS.knife;
      if(e.input.rmb&&e.utilityCd<=0){
        e.utilityCd=w.cooldown;e.knifeAnim=.24;
        let best=null,bestD=Infinity;
        for(const q of room.players.values()){
          if(!q.alive||q.team===e.team)continue;
          const d=distance(e,q);
          if(d<w.range+q.r&&d<bestD&&!lineBlocked(e.x,e.y,q.x,q.y)){best=q;bestD=d;}
        }
        if(best){energyDamage(best,w.damage,{energyMult:w.energyMult,hpMult:w.hpMult});if(best.hp<=0)killEntity(room,best);}
        const gen=room.generators.find(g=>g.team!==e.team);
        if(gen&&!gen.destroyed&&pointRectDistance(e.x,e.y,gen)<=w.range)damageGenerator(room,gen,w.damage,'knife',e.x,e.y);
      }
    }
  }else if(kind==='plasmaPistol'){
    const w=WEAPON_STATS.plasmaPistol;
    if(e.input.rmb&&e.medicPistolCd<=0&&e.energy>=w.energyCost){
      e.energy-=w.energyCost;
      addBullet(room,e,e.angle,w.speed,w.damage,{type:'energy',color:'#6dff7e',energyMult:w.energyMult,hpMult:w.hpMult,r:w.radius,plasma:true,weaponKind:'plasmaPistol'});
      e.medicPistolCd=w.cooldown;
    }
  }
}

function queueHeal(room,target,amount,duration,source){
  room.healJobs.push({targetId:target.id,sourceId:source.id,remaining:duration,rate:amount/duration});
}
function fireUtility(room,e){
  const kind=CLASSES[e.classId].weapon3.kind;
  if(kind==='grenade'){
    if(e.input.mmb&&e.grenadeCd<=0){throwGrenade(room,e);e.grenadeCd=1.65;}
  }else if(kind==='zapper'){
    const w=WEAPON_STATS.zapper;
    if(e.input.mmb&&e.grenadeCd<=0&&e.energy>=w.energyCost){
      e.energy-=w.energyCost;
      addBullet(room,e,e.angle,w.speed,w.damage,{
        type:'energy',color:'#a7f4ff',energyMult:w.energyMult,hpMult:w.hpMult,r:w.radius,life:w.life,
        zapper:true,slowDuration:w.slowDuration,zapRechargeExtra:w.zapRechargeExtra,weaponKind:'zapper'
      });
      e.grenadeCd=w.cooldown;
    }
  }else if(kind==='heal'){
    const cost=e.maxEnergy*.10;
    const moving=Math.hypot(e.vx,e.vy)>2.5||e.input.sprint;
    if(e.input.mmb&&e.healCd<=0&&e.energy>=cost&&!moving){
      if(e.healCharge===0){e.healStartX=e.x;e.healStartY=e.y;}
      if(Math.hypot(e.x-e.healStartX,e.y-e.healStartY)>1.5)e.healCharge=0;
      else{
        e.healCharge+=DT;
        if(e.healCharge>=2){
          e.energy-=cost;e.healCd=4;e.healCharge=0;
          room.effects.push({id:'E'+(++nextEffectId),kind:'heal',sourceId:e.id,x:e.x,y:e.y,r:92,life:2,maxLife:2});
          queueHeal(room,e,30,2,e);
          for(const q of room.players.values()){
            if(!q.alive||q.id===e.id||q.team!==e.team)continue;
            if(distance(e,q)<100)queueHeal(room,q,lineBlocked(e.x,e.y,q.x,q.y)?15:30,2,e);
          }
        }
      }
    }else e.healCharge=0;
  }
}

function updateSupportAI(room,e){
  if(!e.isBot||!e.alive)return;
  const humans=[...room.players.values()].filter(p=>!p.isBot&&p.team===e.team&&p.alive&&p.ready);
  let leader=null,best=Infinity;
  for(const h of humans){const d=distance(e,h);if(d<best){best=d;leader=h;}}
  const target=nearestVisibleEnemy(room,e);
  const dir=e.team==='blue'?1:-1;
  const centerX=WORLD.w/2;
  let supportX=centerX-dir*150,supportY=WORLD.h/2+Math.sin(room.tick*.025+e.supportPhase)*90;
  if(leader){
    const ownEdge=e.team==='blue'?440:1360;
    const advance=e.team==='blue'
      ? clamp((leader.x-ownEdge)/(centerX-ownEdge),0,2)
      : clamp((ownEdge-leader.x)/(ownEdge-centerX),0,2);
    if(advance>=.35){
      supportX=leader.x-dir*110;
      supportY=clamp(leader.y+Math.sin(room.tick*.035+e.supportPhase)*75,120,WORLD.h-120);
      supportX=e.team==='blue'?clamp(supportX,centerX-180,WORLD.w-300):clamp(supportX,300,centerX+180);
    }
  }
  if(target){
    const dx=target.x-e.x,dy=target.y-e.y,d=Math.hypot(dx,dy);
    e.input.aim=Math.atan2(dy,dx);
    e.input.lmb=d<500&&!lineBlocked(e.x,e.y,target.x,target.y);
    e.input.rmb=d<330&&Math.random()<DT*.20;
    e.input.mmb=false;
    let mx=(supportX-e.x)*.7,my=(supportY-e.y)*.7;
    if(d>300){mx+=dx*.55;my+=dy*.55;}
    else if(d<170){mx-=dx*.85;my-=dy*.85;}
    else{mx+=-dy*.18;my+=dx*.18;}
    const ml=Math.hypot(mx,my)||1;
    const worldX=mx/ml,worldY=my/ml;
    const fx=Math.cos(e.angle),fy=Math.sin(e.angle),rx=-fy,ry=fx;
    e.input.forward=worldX*fx+worldY*fy;
    e.input.strafe=worldX*rx+worldY*ry;
  }else{
    e.input.lmb=e.input.rmb=e.input.mmb=false;
    const dx=supportX-e.x,dy=supportY-e.y,d=Math.hypot(dx,dy);
    if(d>28){
      e.input.aim=Math.atan2(dy,dx);
      const wx=dx/d,wy=dy/d,fx=Math.cos(e.angle),fy=Math.sin(e.angle),rx=-fy,ry=fx;
      e.input.forward=(wx*fx+wy*fy)*.62;
      e.input.strafe=(wx*rx+wy*ry)*.62;
    }else{e.input.forward=e.input.strafe=0;}
  }
}

function updateEntity(room,e){
  processCommands(room,e);
  updateWeaponTimers(e);
  if(!e.ready)return;
  if(!e.alive){
    e.deadTimer-=DT;
    if(e.deadTimer<=0)respawnEntity(room,e);
    return;
  }
  updateSupportAI(room,e);
  e.lastHit+=DT;e.slowTimer=Math.max(0,e.slowTimer-DT);e.zapTimer=Math.max(0,e.zapTimer-DT);e.regenSlowTimer=Math.max(0,e.regenSlowTimer-DT);
  if(e.lastHit>=4+(e.zapRechargeExtra||0)){
    e.zapRechargeExtra=0;
    if(!e.input.sprint&&e.energy<e.maxEnergy){
      const regenMult=e.regenSlowTimer>0?.35:1;
      e.energy=Math.min(e.maxEnergy,e.energy+e.energyRegen*regenMult*DT);
    }
  }
  const status=e.slowTimer>0?.25:1;
  e.angle=approachAngle(e.angle,e.input.aim,(e.isBot?4.05:2.1)*status*DT);
  if(e.knockbackTimer>0){
    e.knockbackTimer=Math.max(0,e.knockbackTimer-DT);
    moveWithWalls(room,e,e.vx*DT,e.vy*DT);
    e.vx*=Math.max(0,1-2.8*DT);e.vy*=Math.max(0,1-2.8*DT);
  }else{
    let st=clamp(e.input.strafe,-1,1),fw=clamp(e.input.forward,-1,1),mag=Math.hypot(st,fw);
    if(mag>1){st/=mag;fw/=mag;mag=1;}
    const sprint=e.input.sprint&&mag>.05&&e.energy>0;
    const speedMult=sprint?1.6:1,accelMult=sprint?1.35:1;
    if(mag>.05){
      const fx=Math.cos(e.angle),fy=Math.sin(e.angle),rx=-fy,ry=fx;
      const ax=fx*fw+rx*st,ay=fy*fw+ry*st;
      e.vx+=ax*e.accel*accelMult*status*DT;e.vy+=ay*e.accel*accelMult*status*DT;
    }else{
      const decay=Math.max(0,1-e.drag*DT);e.vx*=decay;e.vy*=decay;
    }
    if(sprint)e.energy=Math.max(0,e.energy-e.maxEnergy*.08*DT);
    const maxSpeed=e.maxSpeed*speedMult*status,sp=Math.hypot(e.vx,e.vy);
    if(sp>maxSpeed){e.vx=e.vx/sp*maxSpeed;e.vy=e.vy/sp*maxSpeed;}
    moveWithWalls(room,e,e.vx*DT,e.vy*DT);
  }
  firePrimary(room,e);fireSecondary(room,e);fireUtility(room,e);
  e.previousInput.rmb=e.input.rmb;
}

function updateBullets(room){
  for(let i=room.bullets.length-1;i>=0;i--){
    const b=room.bullets[i],prevX=b.x,prevY=b.y;
    b.x+=b.vx*DT;b.y+=b.vy*DT;b.life-=DT;
    if(b.life<=0||b.x<0||b.y<0||b.x>WORLD.w||b.y>WORLD.h){
      if(b.cannonBall)explodeCannon(room,b);
      room.bullets.splice(i,1);continue;
    }
    const wall=hitsWall(b.x,b.y,b.r);
    if(wall){
      if(b.bouncesLeft>0){
        let hitX=(prevX+b.r<=wall.x||prevX-b.r>=wall.x+wall.w);
        let hitY=(prevY+b.r<=wall.y||prevY-b.r>=wall.y+wall.h);
        if(!hitX&&!hitY){
          const ds=[Math.abs(prevX-wall.x),Math.abs(prevX-(wall.x+wall.w)),Math.abs(prevY-wall.y),Math.abs(prevY-(wall.y+wall.h))];
          const m=Math.min(...ds);if(m===ds[0]||m===ds[1])hitX=true;else hitY=true;
        }
        if(hitX)b.vx*=-1;if(hitY)b.vy*=-1;b.bouncesLeft--;
        b.x=prevX+b.vx*DT*.35;b.y=prevY+b.vy*DT*.35;
        continue;
      }else{room.bullets.splice(i,1);continue;}
    }
    const gen=room.generators.find(g=>g.team!==b.team);
    if(gen&&!gen.destroyed&&circleHitsGenerator(b.x,b.y,b.r,gen)){
      if(b.cannonBall)explodeCannon(room,b);
      else damageGenerator(room,gen,b.damage*bulletScale(b),b.weaponKind==='zapper'?'zapper':'projectile',b.x,b.y);
      room.bullets.splice(i,1);continue;
    }
    let hit=false;
    for(const q of room.players.values()){
      if(!q.alive||q.team===b.team)continue;
      if(Math.hypot(b.x-q.x,b.y-q.y)<b.r+q.r){
        if(b.cannonBall)explodeCannon(room,b);
        else{
          energyDamage(q,b.damage*bulletScale(b),{
            energyMult:b.energyMult,hpMult:b.hpMult,slowDuration:b.slowDuration,
            zapRechargeExtra:b.zapRechargeExtra,regenSlowDuration:b.regenSlowDuration
          });
          if(q.hp<=0)killEntity(room,q);
        }
        room.bullets.splice(i,1);hit=true;break;
      }
    }
    if(hit)continue;
  }
}

function grenadeDamageAt(distance){const t=clamp(distance/76,0,1);return 170+(85-170)*t;}
function updateGrenades(room){
  for(let i=room.grenades.length-1;i>=0;i--){
    const g=room.grenades[i];g.fuse-=DT;g.playerBounceCd=Math.max(0,g.playerBounceCd-DT);
    if(!g.embeddedGeneratorId){
      const nx=g.x+g.vx*DT,ny=g.y+g.vy*DT;
      const gen=room.generators.find(x=>x.team!==g.team);
      if(gen&&grenadeEntersWeak(g,gen,nx,ny))embedGrenade(g,gen,ny);
      else{
        if(!hitsWall(nx,g.y,g.r)&&!hitsAnyGenerator(room,nx,g.y,g.r))g.x=nx;else g.vx*=-.62;
        if(!hitsWall(g.x,ny,g.r)&&!hitsAnyGenerator(room,g.x,ny,g.r))g.y=ny;else g.vy*=-.62;
      }
    }
    if(!g.embeddedGeneratorId&&g.playerBounceCd<=0){
      for(const q of room.players.values()){
        if(!q.alive||q.team===g.team)continue;
        const dx=g.x-q.x,dy=g.y-q.y,minD=g.r+q.r,d=Math.hypot(dx,dy);
        if(d>0&&d<minD){
          const nx=dx/d,ny=dy/d;g.x=q.x+nx*(minD+.5);g.y=q.y+ny*(minD+.5);
          const dot=g.vx*nx+g.vy*ny;
          if(dot<0){g.vx=(g.vx-2*dot*nx)*.72;g.vy=(g.vy-2*dot*ny)*.72;}
          g.playerBounceCd=.08;break;
        }
      }
    }
    if(!g.embeddedGeneratorId){g.vx*=Math.max(0,1-.95*DT);g.vy*=Math.max(0,1-.95*DT);}
    if(g.fuse<=0){
      room.effects.push({id:'E'+(++nextEffectId),kind:'grenade',x:g.x,y:g.y,r:76,life:.24,maxLife:.24});
      const gen=room.generators.find(x=>x.team!==g.team);
      if(gen&&!gen.destroyed){
        if(g.embeddedGeneratorId===gen.team)damageGenerator(room,gen,170,'grenade',g.x,g.y);
        else{
          const gd=pointRectDistance(g.x,g.y,gen);
          if(gd<=76&&!lineBlocked(g.x,g.y,gen.x+gen.w/2,gen.y+gen.h/2))damageGenerator(room,gen,grenadeDamageAt(gd),'grenade',g.x,g.y);
        }
      }
      for(const q of room.players.values()){
        if(!q.alive||q.team===g.team)continue;
        const d=Math.max(0,Math.hypot(q.x-g.x,q.y-g.y)-q.r);
        if(d<=76&&!lineBlocked(g.x,g.y,q.x,q.y)){
          energyDamage(q,grenadeDamageAt(d),{energyMult:.20,hpMult:1});
          if(q.hp<=0)killEntity(room,q);
        }
      }
      room.grenades.splice(i,1);
    }
  }
}

function updateHealJobs(room){
  for(let i=room.healJobs.length-1;i>=0;i--){
    const h=room.healJobs[i],target=room.players.get(h.targetId),source=room.players.get(h.sourceId);
    if(!target||!target.alive||!source||!source.alive){room.healJobs.splice(i,1);continue;}
    const amount=Math.min(h.rate*DT,h.remaining*h.rate);
    target.hp=Math.min(target.maxHp,target.hp+amount);h.remaining-=DT;
    if(h.remaining<=0||target.hp>=target.maxHp)room.healJobs.splice(i,1);
  }
}

function updateEffects(room){
  for(let i=room.effects.length-1;i>=0;i--){
    const fx=room.effects[i];
    if(fx.sourceId){
      const src=room.players.get(fx.sourceId);
      if(src&&src.alive){fx.x=src.x;fx.y=src.y;}else{room.effects.splice(i,1);continue;}
    }
    fx.life-=DT;if(fx.life<=0)room.effects.splice(i,1);
  }
  for(let i=room.corpses.length-1;i>=0;i--){room.corpses[i].life-=DT;if(room.corpses[i].life<=0)room.corpses.splice(i,1);}
}

function resolveOpponents(room){
  const arr=[...room.players.values()].filter(p=>p.alive);
  for(let i=0;i<arr.length;i++)for(let j=i+1;j<arr.length;j++){
    const a=arr[i],b=arr[j];if(a.team===b.team)continue;
    const dx=b.x-a.x,dy=b.y-a.y,minD=a.r+b.r,d=Math.hypot(dx,dy);
    if(d<=0||d>=minD)continue;
    const nx=dx/d,ny=dy/d,over=minD-d;
    const ax=a.x-nx*over*.5,ay=a.y-ny*over*.5,bx=b.x+nx*over*.5,by=b.y+ny*over*.5;
    if(!hitsWall(ax,ay,a.r)){a.x=ax;a.y=ay;}
    if(!hitsWall(bx,by,b.r)){b.x=bx;b.y=by;}
  }
}

function returnAllToBases(room){
  let bi=0,ri=0;
  for(const e of room.players.values()){
    if(!e.alive)respawnEntity(room,e);
    const idx=e.team==='blue'?bi++:ri++,sp=spawnFor(room,e.team,e.r,idx);
    e.x=sp.x;e.y=sp.y;e.vx=e.vy=0;e.hp=e.maxHp;e.energy=e.maxEnergy;
  }
  room.bullets.length=0;room.grenades.length=0;room.healJobs.length=0;room.effects.length=0;
  room.matchFrozen=true;room.postVictoryTimer=0;
}

function serializeEntity(e){
  return {
    id:e.id,team:e.team,isBot:e.isBot,classId:e.classId,pendingClassId:e.pendingClassId,
    x:e.x,y:e.y,vx:e.vx,vy:e.vy,angle:e.angle,r:e.r,
    hp:e.hp,maxHp:e.maxHp,energy:e.energy,maxEnergy:e.maxEnergy,deadTimer:e.deadTimer,alive:e.alive,ready:e.ready,
    fireCd:e.fireCd,rifleBurstTimer:e.rifleBurstTimer,plasmaSmgBurstTimer:e.plasmaSmgBurstTimer,
    blasterCd:e.blasterCd,shotgunCd:e.shotgunCd,grenadeCd:e.grenadeCd,medicPistolCd:e.medicPistolCd,healCd:e.healCd,
    machineCharge:e.machineCharge,machineBurstTimer:e.machineBurstTimer,machineCd:e.machineCd,
    cannonCharge:e.cannonCharge,cannonCd:e.cannonCd,cannonCharging:e.cannonCharging,
    utilityCd:e.utilityCd,repulsorCd:e.repulsorCd,healCharge:e.healCharge,knifeAnim:e.knifeAnim,
    slowTimer:e.slowTimer,zapTimer:e.zapTimer,zapRechargeExtra:e.zapRechargeExtra,regenSlowTimer:e.regenSlowTimer,
    footmanSecondary:e.footmanSecondary,assassinSecondary:e.assassinSecondary,bounty:e.bounty
  };
}
function snapshotFor(room,viewer){
  const players=[];
  for(const p of room.players.values()){
    if(p.id===viewer.id||p.team===viewer.team||teamCanSee(room,viewer.team,p))players.push(serializeEntity(p));
  }
  const corpseList=room.corpses.filter(c=>c.team===viewer.team||room.teamRadar[viewer.team]>0||livingTeam(room,viewer.team).some(s=>Math.hypot(c.x-s.x,c.y-s.y)<=VISION_RANGE&&!lineBlocked(s.x,s.y,c.x,c.y)));
  return {
    type:'snapshot',yourId:viewer.id,team:viewer.team,tick:room.tick,
    players,generators:room.generators,bullets:room.bullets,grenades:room.grenades,effects:room.effects,corpses:corpseList,
    radar:room.teamRadar[viewer.team],winningTeam:room.winningTeam,postVictoryTimer:room.postVictoryTimer,matchFrozen:room.matchFrozen
  };
}

function tickRoom(room){
  if(room.matchFrozen)return;
  room.tick++;
  room.teamRadar.blue=Math.max(0,room.teamRadar.blue-DT);room.teamRadar.red=Math.max(0,room.teamRadar.red-DT);
  for(const e of room.players.values())updateEntity(room,e);
  resolveOpponents(room);updateBullets(room);updateGrenades(room);updateHealJobs(room);updateEffects(room);
  if(room.winningTeam&&room.postVictoryTimer>0){
    room.postVictoryTimer=Math.max(0,room.postVictoryTimer-DT);
    if(room.postVictoryTimer<=0)returnAllToBases(room);
  }
  if(room.tick%2===0){
    for(const [ws,pid]of room.clients){
      const viewer=room.players.get(pid);if(viewer)send(ws,snapshotFor(room,viewer));
    }
  }
}
setInterval(()=>{for(const room of rooms.values())tickRoom(room);},1000/TICK_RATE);

const PUBLIC_DIR=path.join(__dirname,'public');
const server=http.createServer((req,res)=>{
  let reqPath=req.url.split('?')[0];if(reqPath==='/')reqPath='/index.html';
  const normalized=path.normalize(reqPath).replace(/^(\.\.[/\\])+/, '');
  const filePath=path.join(PUBLIC_DIR,normalized);
  if(!filePath.startsWith(PUBLIC_DIR)){res.writeHead(403);res.end('Forbidden');return;}
  fs.readFile(filePath,(err,data)=>{
    if(err){res.writeHead(404);res.end('Not found');return;}
    const ext=path.extname(filePath);
    const mime={'.html':'text/html; charset=utf-8','.js':'application/javascript; charset=utf-8','.css':'text/css; charset=utf-8'}[ext]||'application/octet-stream';
    res.writeHead(200,{'Content-Type':mime});res.end(data);
  });
});

const wss=new WebSocketServer({server});
wss.on('connection',ws=>{
  ws.playerId='P'+(nextHumanId++);ws.roomCode='';
  ws.on('message',raw=>{
    let msg;try{msg=JSON.parse(raw.toString());}catch{return;}
    if(msg.type==='create_room'){
      leaveRoom(ws);
      const code=makeRoomCode(),room=makeRoom(code);
      const p=makeEntity(room,ws.playerId,'blue',false,0);room.players.set(p.id,p);room.clients.set(ws,p.id);ws.roomCode=code;
      send(ws,{type:'room_created',roomCode:code,playerId:p.id,team:p.team});return;
    }
    if(msg.type==='join_room'){
      const code=String(msg.roomCode||'').trim().toUpperCase(),room=rooms.get(code);
      if(!room){send(ws,{type:'error',message:'Room not found.'});return;}
      if(room.clients.size>=2){send(ws,{type:'error',message:'Room is full (2 human players).'});return;}
      leaveRoom(ws);
      const p=makeEntity(room,ws.playerId,'red',false,0);room.players.set(p.id,p);room.clients.set(ws,p.id);ws.roomCode=code;
      send(ws,{type:'room_joined',roomCode:code,playerId:p.id,team:p.team});return;
    }
    if(!ws.roomCode)return;
    const room=rooms.get(ws.roomCode);if(!room)return;
    const pid=room.clients.get(ws),p=room.players.get(pid);if(!p)return;
    if(msg.type==='input'){
      p.input.strafe=clamp(Number(msg.strafe)||0,-1,1);p.input.forward=clamp(Number(msg.forward)||0,-1,1);
      if(Number.isFinite(Number(msg.aim)))p.input.aim=Number(msg.aim);
      p.input.lmb=!!msg.lmb;p.input.rmb=!!msg.rmb;p.input.mmb=!!msg.mmb;p.input.sprint=!!msg.sprint;
    }else if(msg.type==='class'){
      if(CLASSES[msg.classId]&&(!p.ready||!p.alive)){
        p.pendingClassId=msg.classId;
        if(!p.ready){p.ready=true;applyClass(p,msg.classId,true);p.classId=msg.classId;const sp=spawnFor(room,p.team,p.r,0);p.x=sp.x;p.y=sp.y;}
      }
    }else if(msg.type==='command'){
      if(['swap','repulsor','radar','switchTeam'].includes(msg.command))p.commandQueue.push(msg.command);
    }
  });
  ws.on('close',()=>leaveRoom(ws));
});
server.listen(PORT,()=>console.log(`Infantry v100 authoritative multiplayer on port ${PORT}`));
