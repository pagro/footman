const http=require('http');
const fs=require('fs');
const path=require('path');
const {WebSocketServer,WebSocket}=require('ws');

const PORT=process.env.PORT||3000;
const TICK_RATE=30;
const DT=1/TICK_RATE;
const TEAM_SIZE=4;
const WORLD={w:1800,h:1100};
const VISION_RANGE=520;
const SENSOR_RADIUS=180;
const JAMMER_RADIUS=306;
const HEALING_NODE={x:900,y:550,radius:72,healInterval:2,safeDelay:5};
const FORTIFY_DURATION=4, FORTIFY_SHIELD_HP=200, FORTIFY_COOLDOWN=20;
const CLOAK_DURATION=7;
const SERGEANT_SUMMON_COST=50, SERGEANT_TELEPORT_COST=150, SERGEANT_UTILITY_REACTIVATION=5;
const FLAG_WIN_SCORE=3;
const REPULSOR_SHORT_COOLDOWN=2.8, REPULSOR_LONG_COOLDOWN=30, REPULSOR_MAX_CHARGES=2;
let nextHumanId=1,nextProjectileId=1,nextGrenadeId=1,nextEffectId=1;
const rooms=new Map();

const BASE_FLOORS=[
  {x:40,y:330,w:400,h:440,team:'blue',label:''},
  {x:1360,y:330,w:400,h:440,team:'red',label:''}
];

const WALLS=[
  {x:40,y:330,w:400,h:20,kind:'base',team:'blue'},
  {x:40,y:750,w:400,h:20,kind:'base',team:'blue'},
  {x:40,y:350,w:20,h:400,kind:'base',team:'blue'},
  {x:420,y:350,w:20,h:145,kind:'base',team:'blue'},
  {x:420,y:605,w:20,h:145,kind:'base',team:'blue'},
  {x:330,y:425,w:20,h:250,kind:'base',team:'blue'},
  {x:120,y:455,w:116,h:20,kind:'base',team:'blue',generatorWall:true},
  {x:120,y:625,w:116,h:20,kind:'base',team:'blue',generatorWall:true},
  {x:236,y:455,w:20,h:190,kind:'base',team:'blue',generatorWall:true},

  {x:1360,y:330,w:400,h:20,kind:'base',team:'red'},
  {x:1360,y:750,w:400,h:20,kind:'base',team:'red'},
  {x:1740,y:350,w:20,h:400,kind:'base',team:'red'},
  {x:1360,y:350,w:20,h:145,kind:'base',team:'red'},
  {x:1360,y:605,w:20,h:145,kind:'base',team:'red'},
  {x:1450,y:425,w:20,h:250,kind:'base',team:'red'},
  {x:1564,y:455,w:116,h:20,kind:'base',team:'red',generatorWall:true},
  {x:1564,y:625,w:116,h:20,kind:'base',team:'red',generatorWall:true},
  {x:1544,y:455,w:20,h:190,kind:'base',team:'red',generatorWall:true},

  {x:480,y:242,w:132,h:22,kind:'ricochet'},{x:628,y:292,w:22,h:104,kind:'ricochet'},
  {x:506,y:408,w:90,h:20,kind:'ricochet'},{x:442,y:322,w:24,h:74,kind:'cover'},
  {x:480,y:836,w:132,h:22,kind:'ricochet'},{x:628,y:704,w:22,h:104,kind:'ricochet'},
  {x:506,y:672,w:90,h:20,kind:'ricochet'},{x:442,y:704,w:24,h:74,kind:'cover'},
  {x:1188,y:242,w:132,h:22,kind:'ricochet'},{x:1150,y:292,w:22,h:104,kind:'ricochet'},
  {x:1204,y:408,w:90,h:20,kind:'ricochet'},{x:1334,y:322,w:24,h:74,kind:'cover'},
  {x:1188,y:836,w:132,h:22,kind:'ricochet'},{x:1150,y:704,w:22,h:104,kind:'ricochet'},
  {x:1204,y:672,w:90,h:20,kind:'ricochet'},{x:1334,y:704,w:24,h:74,kind:'cover'},
  {x:748,y:338,w:108,h:20,kind:'ricochet'},{x:944,y:338,w:108,h:20,kind:'ricochet'},
  {x:748,y:742,w:108,h:20,kind:'ricochet'},{x:944,y:742,w:108,h:20,kind:'ricochet'},
  {x:716,y:392,w:20,h:94,kind:'ricochet'},{x:1064,y:392,w:20,h:94,kind:'ricochet'},
  {x:716,y:614,w:20,h:94,kind:'ricochet'},{x:1064,y:614,w:20,h:94,kind:'ricochet'},
  {x:820,y:478,w:24,h:62,kind:'cover'},{x:956,y:478,w:24,h:62,kind:'cover'},
  {x:820,y:560,w:24,h:62,kind:'cover'},{x:956,y:560,w:24,h:62,kind:'cover'},
  {x:548,y:524,w:50,h:50,kind:'crate'},{x:662,y:532,w:60,h:38,kind:'cover'},
  {x:1078,y:532,w:60,h:38,kind:'cover'},{x:1202,y:524,w:50,h:50,kind:'crate'},
  {x:720,y:166,w:74,h:24,kind:'cover'},{x:1006,y:166,w:74,h:24,kind:'cover'},
  {x:720,y:910,w:74,h:24,kind:'cover'},{x:1006,y:910,w:74,h:24,kind:'cover'},
  {x:584,y:608,w:42,h:42,kind:'crate'},{x:1174,y:450,w:42,h:42,kind:'crate'},
  {x:888,y:538,w:24,h:24,kind:'healingNode'}
];

const GENERATOR_TEMPLATE=[
  {team:'blue',x:150,y:505,w:60,h:90,hp:950,maxHp:950,destroyed:false,backDoor:{x:202,y:528,w:12,h:44,side:'east'},interior:{x:60,y:350,w:360,h:400}},
  {team:'red',x:1590,y:505,w:60,h:90,hp:950,maxHp:950,destroyed:false,backDoor:{x:1586,y:528,w:12,h:44,side:'west'},interior:{x:1380,y:350,w:360,h:400}}
];
const FLAG_TEMPLATE=[
  {team:'blue',spawnX:92,spawnY:550,x:92,y:550,carrierId:null,dropped:false,returnTimer:0},
  {team:'red',spawnX:1708,spawnY:550,x:1708,y:550,carrierId:null,dropped:false,returnTimer:0}
];

const WEAPON_STATS={
  rifle:{damage:28,speed:194.4,burstCount:3,burstGap:.2277,cooldown:.70,radius:2.8},
  machinegun:{damage:24,speed:204,fireInterval:.114,spinUp:.75,spread:.05,fullRateDuration:4,halfRateAt:6,lateRateMult:.25},
  flamethrower:{damage:3.125,pellets:3,speed:165,chargeTime:.50,fireInterval:.10,energyCost:4,spread:.18,radius:5,range:84.5,life:.76,energyMult:.35,hpMult:1,stackDamagePerHit:.05,maxStacks:40,stackResetTime:1,lowEnergyDamageMult:1.35,highEnergyDamageMult:.65},
  blaster:{damage:19.04,speed:151.8,energyCost:15,cooldown:1,maxCycleShots:2,cycleCooldown:3,partialResetTime:3,energyMult:2,hpMult:.5,life:1.8,bounces:2,regenSlowDuration:3,regenSlowMult:.35},
  cannon:{speed:104,energyCost:70,chargeTime:2,cooldown:2.2,life:2.64,bounces:2,radius:10,explosionRadius:68,explosionDamage:120,energyMult:1.5,hpMult:1},
  plasmaPistol:{damage:24,speed:200,energyCost:8,cooldown:.55,energyMult:1.5,hpMult:.6,radius:1.35,life:1.1316},
  plasmaSMG:{damage:12,speed:168,energyCost:3.5,burstCount:4,burstGap:.08,burstCooldown:.65,energyMult:1.45,hpMult:.58,radius:1.7,life:.868,spread:.028},
  physicalPistol:{damage:22,speed:205,cooldown:.48,radius:1.25,life:1.15},
  knife:{damage:95,range:29.64,cooldown:.65,energyMult:.7,hpMult:1.5},
  zapper:{damage:12,speed:240,energyCost:15,cooldown:10,range:203.5,life:.58,energyMult:1.15,hpMult:.35,radius:3,slowDuration:2.5,zapRechargeExtra:3},
  medicGun:{damage:24,speed:188,burstCount:2,burstGap:.22,cooldown:1.1,life:1.53,radius:2.2},
  shotgun:{damage:19,pellets:9,speed:176,spreadStep:.028,life:.62,falloffStart:22,falloffEnd:116,minScale:.04,cooldown:.90}
};

const CLASSES={
  footman:{name:'Footman',maxHp:180,maxEnergy:150,speed:45,accel:95,drag:2.6,energyRegen:13,radius:12},
  heavy:{name:'Heavy',maxHp:200,maxEnergy:200,speed:38,accel:75,drag:2.9,energyRegen:11,radius:12},
  assassin:{name:'Assassin',maxHp:130,maxEnergy:200,speed:42.5,accel:110,drag:2.3,energyRegen:15,radius:9.6},
  medic:{name:'Medic',maxHp:160,maxEnergy:150,speed:45,accel:95,drag:2.5,energyRegen:12,radius:12},
  sergeant:{name:'Sergeant',maxHp:165,maxEnergy:200,speed:37,accel:100,drag:2.6,energyRegen:12,radius:12}
};
const CLASS_IDS=Object.keys(CLASSES);

const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const rand=(a,b)=>a+Math.random()*(b-a);
const opposingTeam=t=>t==='blue'?'red':'blue';
const deepClone=v=>JSON.parse(JSON.stringify(v));
function approachAngle(current,target,maxStep){let d=((target-current+Math.PI)%(Math.PI*2)+Math.PI*2)%(Math.PI*2)-Math.PI;return Math.abs(d)<=maxStep?target:current+Math.sign(d)*maxStep;}
function pointInRect(x,y,r){return x>=r.x&&x<=r.x+r.w&&y>=r.y&&y<=r.y+r.h;}
function circleHitsRect(x,y,r,rect){const nx=clamp(x,rect.x,rect.x+rect.w),ny=clamp(y,rect.y,rect.y+rect.h),dx=x-nx,dy=y-ny;return dx*dx+dy*dy<r*r;}
function pointRectDistance(x,y,r){const nx=clamp(x,r.x,r.x+r.w),ny=clamp(y,r.y,r.y+r.h);return Math.hypot(x-nx,y-ny);}
function circleHitsGenerator(x,y,r,g){return pointRectDistance(x,y,g)<r;}
function segmentHitsRect(x1,y1,x2,y2,r){let t0=0,t1=1;const dx=x2-x1,dy=y2-y1;for(const [p,q] of [[-dx,x1-r.x],[dx,r.x+r.w-x1],[-dy,y1-r.y],[dy,r.y+r.h-y1]]){if(Math.abs(p)<1e-9){if(q<0)return false;}else{const t=q/p;if(p<0){if(t>t1)return false;if(t>t0)t0=t;}else{if(t<t0)return false;if(t<t1)t1=t;}}}return true;}
function lineBlocked(x1,y1,x2,y2){for(const w of WALLS)if(segmentHitsRect(x1,y1,x2,y2,w))return true;return false;}
function hitsWall(x,y,r=0){for(const w of WALLS)if(circleHitsRect(x,y,r,w))return w;return null;}
function hitsAnyGenerator(room,x,y,r=0){for(const g of room.generators)if(!g.destroyed&&circleHitsGenerator(x,y,r,g))return g;return null;}
function moveWithWalls(room,e,dx,dy){let ox=e.x,oy=e.y;e.x+=dx;if(hitsWall(e.x,e.y,e.r)||hitsAnyGenerator(room,e.x,e.y,e.r)){e.x=ox;e.vx*=.12;}e.y+=dy;if(hitsWall(e.x,e.y,e.r)||hitsAnyGenerator(room,e.x,e.y,e.r)){e.y=oy;e.vy*=.12;}e.x=clamp(e.x,28,WORLD.w-28);e.y=clamp(e.y,28,WORLD.h-28);}
function spawnFor(room,team,r,index=0){const b=[[285,550],[285,500],[285,600],[365,550]],red=[[1515,550],[1515,500],[1515,600],[1435,550]],arr=team==='blue'?b:red;for(let o=0;o<arr.length;o++){const p=arr[(index+o)%arr.length];if(!hitsWall(p[0],p[1],r)&&!hitsAnyGenerator(room,p[0],p[1],r))return{x:p[0],y:p[1]};}return team==='blue'?{x:285,y:550}:{x:1515,y:550};}
function teamMembers(room,team){return [...room.players.values()].filter(e=>e.team===team);}
function livingTeam(room,team){return teamMembers(room,team).filter(e=>e.ready&&e.alive);}
function distance(a,b){return Math.hypot(a.x-b.x,a.y-b.y);}

function classStats(id){return CLASSES[id]||CLASSES.footman;}
function applyClass(e,id,full=false){const c=classStats(id);e.classId=CLASSES[id]?id:'footman';e.maxHp=c.maxHp;e.maxEnergy=c.maxEnergy;e.maxSpeed=c.speed;e.accel=c.accel;e.drag=c.drag;e.energyRegen=c.energyRegen;e.r=c.radius;if(full){e.hp=e.maxHp;e.energy=e.maxEnergy;}else{e.hp=Math.min(e.hp??e.maxHp,e.maxHp);e.energy=Math.min(e.energy??e.maxEnergy,e.maxEnergy);}}
function resetCombatState(e){
  e.lastHit=99;e.vx=e.vy=0;e.sprinting=false;e.slowTimer=e.zapTimer=e.zapVisualTimer=e.zapRechargeExtra=e.regenSlowTimer=e.knockbackTimer=0;
  e.fireCd=e.blasterCd=e.shotgunCd=e.grenadeCd=e.medicPistolCd=e.healCd=e.machineCd=e.machineBurstTimer=e.cannonCd=e.utilityCd=e.zapperCd=0;
  e.rifleBurstLeft=e.rifleBurstTimer=e.plasmaSmgBurstLeft=e.plasmaSmgBurstTimer=0;e.rifleTriggerLatch=false;
  e.blasterCycleShots=e.blasterIdleReset=e.blasterCycleLock=0;e.machineCharge=e.machineSustainTime=0;e.flameCharge=e.flameCd=0;e.flameChargeSounded=false;
  e.cannonCharge=0;e.cannonCharging=false;e.cannonClickLatch=false;e.healCharge=0;e.healCharging=false;e.healClickLatch=false;e.knifeAnim=0;
  e.repulsorCd=0;e.repulsorCharges=REPULSOR_MAX_CHARGES;e.repulsorRechargeTimer=0;e.fortifyTimer=0;e.fortifyShield=0;e.fortifyShieldMax=FORTIFY_SHIELD_HP;e.fortifyCd=0;e.cloakTimer=0;e.cloakRevealTimer=0;
  e.jammerActive=false;e.sensorsActive=false;e.jammerReactivationCd=0;e.sensorsReactivationCd=0;e.weaponChannel=0;e.lastFiredWeaponSlot=0;e.zappedWeaponSwitchLock=0;
  e.flameStacks=0;e.flameStackAge=WEAPON_STATS.flamethrower.stackResetTime;e.grenadesRemaining=3;e.carryingFlagTeam=null;e.classChangeTarget=null;e.classChangeTimer=0;
  e.aiExploreX=null;e.aiExploreY=null;e.aiExploreTimer=0;e.aiExploreStep=0;e.aiAvoidTimer=0;e.aiAvoidSide=e.aiAvoidSide||1;e.aiNavCheck=0;e.aiLastX=e.x;e.aiLastY=e.y;
}
function makeEntity(room,id,team,index,isBot=true){const sp=spawnFor(room,team,12,index),e={id,slotIndex:index,team,isBot,ready:isBot,playerName:isBot?`BOT ${index+1}`:'Player',classId:'footman',pendingClassId:'footman',x:sp.x,y:sp.y,angle:team==='blue'?0:Math.PI,r:12,hp:180,maxHp:180,energy:150,maxEnergy:150,maxSpeed:45,accel:95,drag:2.6,energyRegen:13,vx:0,vy:0,alive:true,deadTimer:0,input:{strafe:0,forward:0,aim:team==='blue'?0:Math.PI,lmb:false,rmb:false,mmb:false,sprint:false},previousInput:{lmb:false,rmb:false,mmb:false},commandQueue:[],footmanSecondary:'blaster',assassinSecondary:'knife',heavyPrimary:'machinegun',sergeantUtility:'jammer',bounty:0,streak:0,kills:0,deaths:0,cash:0,healingNodeTimer:0,radarTimer:0,aiDecision:0};applyClass(e,isBot?CLASS_IDS[(index+(team==='red'?1:0))%CLASS_IDS.length]:'footman',true);e.pendingClassId=e.classId;resetCombatState(e);return e;}
function makeBot(room,team,index){return makeEntity(room,`BOT_${team}_${index}`,team,index,true);}
function makeRoom(code){const room={code,clients:new Map(),players:new Map(),generators:deepClone(GENERATOR_TEMPLATE),flags:deepClone(FLAG_TEMPLATE),bullets:[],grenades:[],healJobs:[],effects:[],corpses:[],winningTeam:null,postVictoryTimer:0,matchFrozen:false,matchRestartTimer:0,flagScore:{blue:0,red:0},tick:0};for(const team of ['blue','red'])for(let i=0;i<TEAM_SIZE;i++){const b=makeBot(room,team,i);room.players.set(b.id,b);}rooms.set(code,room);return room;}
function makeRoomCode(){const chars='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';for(let n=0;n<1000;n++){let c='';for(let i=0;i<4;i++)c+=chars[Math.floor(Math.random()*chars.length)];if(!rooms.has(c))return c;}throw Error('room code');}
function humanCount(room,team){return [...room.players.values()].filter(e=>!e.isBot&&e.team===team).length;}
function findBotSlot(room,team){return [...room.players.values()].find(e=>e.isBot&&e.team===team);}
function chooseJoinTeam(room,preferred=null){if(preferred&&humanCount(room,preferred)<TEAM_SIZE&&findBotSlot(room,preferred))return preferred;const b=humanCount(room,'blue'),r=humanCount(room,'red');if(b<r&&findBotSlot(room,'blue'))return'blue';if(r<b&&findBotSlot(room,'red'))return'red';if(findBotSlot(room,'blue'))return'blue';if(findBotSlot(room,'red'))return'red';return null;}
function replaceBotWithHuman(room,ws,team){const bot=findBotSlot(room,team);if(!bot)return null;const index=bot.slotIndex;room.players.delete(bot.id);const p=makeEntity(room,ws.playerId,team,index,false);room.players.set(p.id,p);room.clients.set(ws,p.id);ws.roomCode=room.code;return p;}
function restoreBot(room,p){if(!p)return;room.players.delete(p.id);const b=makeBot(room,p.team,p.slotIndex);room.players.set(b.id,b);}
function send(ws,obj){if(ws.readyState===WebSocket.OPEN)ws.send(JSON.stringify(obj));}
function emitGameEvent(room,event){const payload=JSON.stringify({type:'game_event',event:{...event,serverTick:room.tick}});for(const ws of room.clients.keys())if(ws.readyState===WebSocket.OPEN)ws.send(payload);}
function leaveRoom(ws){if(!ws.roomCode)return;const room=rooms.get(ws.roomCode);if(!room){ws.roomCode='';return;}const id=room.clients.get(ws),p=room.players.get(id);room.clients.delete(ws);if(p)restoreBot(room,p);if(room.clients.size===0)rooms.delete(room.code);ws.roomCode='';}

function activeEnemyJammersFor(room,e){return [...room.players.values()].filter(j=>j!==e&&j.alive&&j.ready&&j.team!==e.team&&j.classId==='sergeant'&&j.jammerActive&&j.zapTimer<=0);}
function isJammed(room,e){return activeEnemyJammersFor(room,e).some(j=>distance(j,e)<=JAMMER_RADIUS);}
function sensorsReveal(room,target,team){if(target.team===team||target.classId!=='assassin'||target.cloakTimer<=0)return false;return livingTeam(room,team).some(s=>s.classId==='sergeant'&&s.sensorsActive&&s.zapTimer<=0&&distance(s,target)<=SENSOR_RADIUS);}
function proximityReveals(room,target,team){if(target.classId!=='assassin'||target.cloakTimer<=0)return false;return livingTeam(room,team).some(s=>s!==target&&distance(s,target)<=72&&!lineBlocked(s.x,s.y,target.x,target.y));}
function cloakedFromTeam(room,target,team){if(target.team===team||target.classId!=='assassin'||target.cloakTimer<=0)return false;if(target.cloakRevealTimer>0||sensorsReveal(room,target,team)||proximityReveals(room,target,team))return false;return true;}
function entityVisibleToViewer(room,viewer,target){if(target.team===viewer.team)return true;if(viewer.radarTimer>0)return true;if(cloakedFromTeam(room,target,viewer.team))return false;const sources=viewer.zapTimer>0?[viewer]:livingTeam(room,viewer.team);return sources.some(s=>distance(s,target)<=VISION_RANGE&&!lineBlocked(s.x,s.y,target.x,target.y));}
function pointVisibleToViewer(room,viewer,x,y){if(viewer.radarTimer>0)return true;const sources=viewer.zapTimer>0?[viewer]:livingTeam(room,viewer.team);return sources.some(s=>Math.hypot(s.x-x,s.y-y)<=VISION_RANGE&&!lineBlocked(s.x,s.y,x,y));}
function nearestVisibleEnemy(room,e){let best=null,bd=Infinity;for(const q of room.players.values()){if(!q.alive||!q.ready||q.team===e.team)continue;if(cloakedFromTeam(room,q,e.team))continue;const sources=livingTeam(room,e.team);if(!sources.some(s=>distance(s,q)<=VISION_RANGE&&!lineBlocked(s.x,s.y,q.x,q.y)))continue;const d=distance(e,q);if(d<bd){bd=d;best=q;}}return best;}

function weaponRateDt(e){return e.zapTimer>0?DT*.20:DT;}
function canUseSlot(e,slot){return e.zapTimer<=0||e.zappedWeaponSwitchLock<=0||e.lastFiredWeaponSlot===slot;}
function noteFired(e,slot){e.lastFiredWeaponSlot=slot;if(e.classId==='assassin'&&e.cloakTimer>0)e.cloakRevealTimer=1;if(e.zapTimer>0)e.zappedWeaponSwitchLock=.75;}
function machineRateMult(e){const w=WEAPON_STATS.machinegun,t=Math.max(0,e.machineSustainTime||0);if(t<=w.fullRateDuration)return 1;if(t<=w.halfRateAt){const p=(t-w.fullRateDuration)/(w.halfRateAt-w.fullRateDuration);return 1-p*.5;}return w.lateRateMult;}
function machineInterval(e){return WEAPON_STATS.machinegun.fireInterval/Math.max(.01,machineRateMult(e));}
function tickBlasterCycle(e){const w=WEAPON_STATS.blaster;e.blasterCycleLock=Math.max(0,e.blasterCycleLock-DT);if(e.blasterCycleLock<=0&&e.blasterCycleShots>0){e.blasterIdleReset=Math.max(0,e.blasterIdleReset-DT);if(e.blasterIdleReset<=0){e.blasterCycleShots=0;e.blasterIdleReset=0;}}if(e.blasterCycleLock<=0&&e.blasterCycleShots>=w.maxCycleShots){e.blasterCycleShots=0;e.blasterIdleReset=0;}}
function canFireBlaster(e){return e.blasterCycleLock<=0;}
function noteBlaster(e){const w=WEAPON_STATS.blaster;e.blasterCycleShots++;if(e.blasterCycleShots>=w.maxCycleShots){e.blasterCycleShots=w.maxCycleShots;e.blasterCycleLock=w.cycleCooldown;e.blasterIdleReset=0;}else e.blasterIdleReset=w.partialResetTime;}

function flameDamage(target,base){
  const w=WEAPON_STATS.flamethrower;
  if((target.flameStackAge??w.stackResetTime)>=w.stackResetTime)target.flameStacks=0;
  const stacks=Math.max(0,target.flameStacks||0);
  const stackMult=1+Math.min(stacks,w.maxStacks)*w.stackDamagePerHit;
  target.flameStacks=Math.min(w.maxStacks,stacks+1);
  target.flameStackAge=0;

  // Flamethrower is a low-Energy finisher: at 0% Energy it deals 35% more
  // raw damage, while at 100% Energy it deals 35% less raw damage.
  // Generators have no Energy pool, so their modifier stays neutral.
  let energyMult=1;
  if(Number.isFinite(target.maxEnergy)&&target.maxEnergy>0){
    const energyPct=clamp(target.energy/target.maxEnergy,0,1);
    energyMult=w.lowEnergyDamageMult+(w.highEnergyDamageMult-w.lowEnergyDamageMult)*energyPct;
  }
  return base*stackMult*energyMult;
}
function applyDamage(room,target,dmg,opts={}){if(!target.alive)return;const pct=clamp(target.energy/target.maxEnergy,0,1),fort=target.fortifyTimer>0&&target.fortifyShield>0,blocked=dmg*pct,drain=fort?0:blocked*(opts.energyMult??1);let hp=(dmg-blocked)*(opts.hpMult??1);if(drain>0)target.energy=Math.max(0,target.energy-drain);if(hp>0&&fort){const a=Math.min(target.fortifyShield,hp);target.fortifyShield-=a;hp-=a;}if(hp>0)target.hp=Math.max(0,target.hp-hp);target.lastHit=0;if(opts.slowDuration>0){target.slowTimer=Math.max(target.slowTimer,opts.slowDuration);if(opts.zapRechargeExtra>0){target.zapTimer=Math.max(target.zapTimer,opts.slowDuration);target.zapVisualTimer=Math.max(target.zapVisualTimer,opts.slowDuration+2);}}if(opts.zapRechargeExtra>0)target.zapRechargeExtra=Math.max(target.zapRechargeExtra,opts.zapRechargeExtra);if(opts.regenSlowDuration>0)target.regenSlowTimer=Math.max(target.regenSlowTimer,opts.regenSlowDuration);}
function dropFlag(room,e){if(!e.carryingFlagTeam)return;const f=room.flags.find(x=>x.team===e.carryingFlagTeam);if(f){f.carrierId=null;f.dropped=true;f.returnTimer=45;f.x=e.x;f.y=e.y;}e.carryingFlagTeam=null;}
function killEntity(room,e,killer=null){if(!e.alive)return;dropFlag(room,e);e.alive=false;e.hp=0;e.vx=e.vy=0;e.deaths++;if(killer&&killer.team!==e.team){killer.kills++;killer.streak++;killer.bounty++;if(!killer.isBot)killer.cash+=Math.round(10*(killer.bounty>=200?5:killer.bounty>=120?2.5:killer.bounty>=70?2:killer.bounty>=35?1.5:killer.bounty>=15?1.25:1));}e.streak=0;e.bounty=0;const base=BASE_FLOORS.find(b=>b.team===e.team),inside=base&&pointInRect(e.x,e.y,base);e.deadTimer=e.isBot?6:(inside?10:4);room.corpses.push({id:'C'+(++nextEffectId),ownerId:e.id,team:e.team,classId:e.classId,x:e.x,y:e.y,angle:e.angle,r:e.r,life:e.isBot?6:e.deadTimer});emitGameEvent(room,{kind:'death',entityId:e.id,team:e.team,x:e.x,y:e.y,killerId:killer?.id||null});}
function respawnEntity(room,e){applyClass(e,e.pendingClassId||e.classId,true);e.classId=e.pendingClassId||e.classId;resetCombatState(e);const s=spawnFor(room,e.team,e.r,e.slotIndex);e.x=s.x;e.y=s.y;e.angle=e.team==='blue'?0:Math.PI;e.alive=true;e.deadTimer=0;}

function isGeneratorWeak(gen,x,y,kind){if(!['cannon','grenade','zapper'].includes(kind)||!pointInRect(x,y,gen.interior)||Math.abs(y-(gen.y+gen.h/2))>70)return false;return gen.backDoor.side==='west'?x<=gen.x+gen.w*.45:x>=gen.x+gen.w*.55;}
function damageGenerator(room,gen,raw,kind,x,y,targetForFlame=null){if(!gen||gen.destroyed||raw<=0)return;let d=targetForFlame?flameDamage(gen,raw):raw,m=kind==='knife'?.10:.25;if(isGeneratorWeak(gen,x,y,kind))m*=3;gen.hp=Math.max(0,gen.hp-d*m);if(gen.hp<=0&&!gen.destroyed){gen.destroyed=true;room.winningTeam=opposingTeam(gen.team);room.postVictoryTimer=20;emitGameEvent(room,{kind:'generator_destroyed',team:gen.team,winningTeam:room.winningTeam,x:gen.x+gen.w/2,y:gen.y+gen.h/2});room.effects.push({id:'E'+(++nextEffectId),kind:'cannon',x:gen.x+gen.w/2,y:gen.y+gen.h/2,r:120,life:.65,maxLife:.65});}}

function bulletInwardOwnWall(room,b,w,x=b.x,y=b.y){if(!w.generatorWall||w.team!==b.team)return false;const g=room.generators.find(g=>g.team===b.team);if(!g)return false;return b.vx*(g.x+g.w/2-x)+b.vy*(g.y+g.h/2-y)>0;}
function hitsWallForBullet(room,b,x=b.x,y=b.y,r=b.r){for(const w of WALLS){if(!circleHitsRect(x,y,r,w))continue;if(w.generatorWall&&w.team===b.team&&bulletInwardOwnWall(room,b,w,x,y))continue;return w;}return null;}
function markGeneratorWallPass(room,b){for(const w of WALLS){if(!w.generatorWall||w.team!==b.team||!circleHitsRect(b.x,b.y,b.r,w))continue;if(bulletInwardOwnWall(room,b,w)){b.generatorWallDamageMult=Math.min(b.generatorWallDamageMult??1,.5);}}}
function addBullet(room,owner,angle,speed,damage,meta={}){const type=meta.type??'physical',launch=speed*(type==='physical'?.8:1);if(!meta.noEvent)emitGameEvent(room,{kind:'weapon_fired',actorId:owner.id,team:owner.team,weapon:meta.weaponKind||'projectile',x:owner.x,y:owner.y,angle});room.bullets.push({id:'B'+(++nextProjectileId),ownerId:owner.id,team:owner.team,x:owner.x+Math.cos(angle)*(owner.r+8),y:owner.y+Math.sin(angle)*(owner.r+8),startX:owner.x,startY:owner.y,vx:Math.cos(angle)*launch,vy:Math.sin(angle)*launch,r:meta.r??4,damage,type,life:meta.life??1.8,energyMult:meta.energyMult??(type==='physical'?.6:1),hpMult:meta.hpMult??1,color:meta.color??null,longBeam:!!meta.longBeam,rifleBullet:!!meta.rifleBullet,fade:!!meta.fade,falloffStart:meta.falloffStart??0,falloffEnd:meta.falloffEnd??9999,minScale:meta.minScale??1,generatorWallDamageMult:1,bouncesLeft:Math.max(meta.bouncesLeft??0,type==='energy'?1:0),plasma:!!meta.plasma,plasmaSMG:!!meta.plasmaSMG,zapper:!!meta.zapper,flame:!!meta.flame,slowDuration:meta.slowDuration??0,zapRechargeExtra:meta.zapRechargeExtra??0,regenSlowDuration:meta.regenSlowDuration??0,cannonBall:!!meta.cannonBall,explodeRadius:meta.explodeRadius??0,explodeDamage:meta.explodeDamage??0,weaponKind:meta.weaponKind??'projectile'});}
function bulletScale(b){const wm=b.generatorWallDamageMult??1;if(!b.fade)return wm;const d=Math.hypot(b.x-b.startX,b.y-b.startY);if(d<=b.falloffStart)return wm;if(d>=b.falloffEnd)return b.minScale*wm;const t=(d-b.falloffStart)/(b.falloffEnd-b.falloffStart);return (1-(1-b.minScale)*t)*wm;}
function explodeCannon(room,b){const r=b.explodeRadius||68,dmg=(b.explodeDamage||120)*(b.generatorWallDamageMult??1);emitGameEvent(room,{kind:'cannon_explosion',actorId:b.ownerId,x:b.x,y:b.y});room.effects.push({id:'E'+(++nextEffectId),kind:'cannon',x:b.x,y:b.y,r,life:.34,maxLife:.34});const gen=room.generators.find(g=>g.team!==b.team);if(gen&&!gen.destroyed){const d=pointRectDistance(b.x,b.y,gen);if(d<=r&&!lineBlocked(b.x,b.y,gen.x+gen.w/2,gen.y+gen.h/2))damageGenerator(room,gen,dmg*(1-clamp(d/r,0,1)*.45),'cannon',b.x,b.y);}for(const q of room.players.values()){if(!q.alive||q.team===b.team)continue;const d=distance(q,b);if(d<=r+q.r&&!lineBlocked(b.x,b.y,q.x,q.y)){applyDamage(room,q,dmg*(1-clamp(d/r,0,1)*.45),{energyMult:WEAPON_STATS.cannon.energyMult,hpMult:1});if(q.hp<=0)killEntity(room,q,room.players.get(b.ownerId));}}}

function grenadeWeak(g,gen,nx,ny){if(!g||!gen||gen.destroyed||g.embeddedGeneratorId)return false;const inward=gen.backDoor.side==='west'?g.vx>0:g.vx<0;if(!inward)return false;const p=gen.backDoor,x=clamp(nx,p.x,p.x+p.w),y=clamp(ny,p.y,p.y+p.h);return (nx-x)**2+(ny-y)**2<=g.r*g.r;}
function throwGrenade(room,e){if(e.grenadesRemaining<=0)return;const speed=185+(e.sprinting?22:0);e.grenadesRemaining--;emitGameEvent(room,{kind:'grenade_throw',actorId:e.id,x:e.x,y:e.y});room.grenades.push({id:'G'+(++nextGrenadeId),ownerId:e.id,team:e.team,x:e.x+Math.cos(e.angle)*(e.r+6),y:e.y+Math.sin(e.angle)*(e.r+6),vx:Math.cos(e.angle)*speed+e.vx,vy:Math.sin(e.angle)*speed+e.vy,r:5,fuse:2.5,playerBounceCd:0,embeddedGeneratorId:null});}
function grenadeDamage(d){const t=clamp(d/76,0,1);return 170+(85-170)*t;}

function triggerRepulsor(room,e){
  if(!e.alive||e.repulsorCd>0||(e.repulsorCharges??REPULSOR_MAX_CHARGES)<=0||e.energy<75)return;
  const chargesBefore=e.repulsorCharges??REPULSOR_MAX_CHARGES;
  e.energy-=75;
  e.repulsorCharges=Math.max(0,chargesBefore-1);

  if(chargesBefore===REPULSOR_MAX_CHARGES){
    // First use starts a rolling 30s refresh window.
    e.repulsorRechargeTimer=REPULSOR_LONG_COOLDOWN;
  }

  if(e.repulsorCharges>0){
    e.repulsorCd=REPULSOR_SHORT_COOLDOWN;
  }else{
    // Spending the second charge starts a fresh full 30s exhausted cooldown.
    e.repulsorCd=REPULSOR_LONG_COOLDOWN;
    e.repulsorRechargeTimer=REPULSOR_LONG_COOLDOWN;
  }

  emitGameEvent(room,{kind:'repulsor',actorId:e.id,x:e.x,y:e.y,charges:e.repulsorCharges,cooldown:e.repulsorCd,rechargeTimer:e.repulsorRechargeTimer});
  room.effects.push({id:'E'+(++nextEffectId),kind:'repulsor',x:e.x,y:e.y,r:155,life:.34,maxLife:.34});
  for(const q of room.players.values()){
    if(!q.alive||q.team===e.team)continue;
    let dx=q.x-e.x,dy=q.y-e.y,d=Math.hypot(dx,dy);
    if(d<=0||d>155)continue;
    const nX=dx/d,nY=dy/d,s=205*(1-d/155*.55);
    q.vx=nX*s+q.vx*.2;q.vy=nY*s+q.vy*.2;q.knockbackTimer=.42;
    q.healCharging=false;q.cannonCharging=false;
  }
  for(const b of room.bullets){let dx=b.x-e.x,dy=b.y-e.y,d=Math.hypot(dx,dy);if(d<=0||d>155)continue;const nx=dx/d,ny=dy/d,cur=Math.hypot(b.vx,b.vy),out=Math.max(310*(1-d/155*.45),cur*.65);b.vx=b.vx*.25+nx*out;b.vy=b.vy*.25+ny*out;}
  for(const g of room.grenades){if(g.embeddedGeneratorId)continue;let dx=g.x-e.x,dy=g.y-e.y,d=Math.hypot(dx,dy);if(d<=0||d>155)continue;g.vx+=dx/d*310*(1-d/155*.35);g.vy+=dy/d*310*(1-d/155*.35);g.playerBounceCd=.08;}
}
function activateFortify(e){if(e.classId!=='heavy'||e.fortifyTimer>0||e.fortifyCd>0||e.energy<100)return;e.energy-=100;e.fortifyTimer=FORTIFY_DURATION;e.fortifyCd=FORTIFY_COOLDOWN;e.fortifyShield=FORTIFY_SHIELD_HP;}
function activateCloak(e){if(e.classId!=='assassin'||e.cloakTimer>0||e.energy<100||e.carryingFlagTeam)return;e.energy-=100;e.cloakTimer=CLOAK_DURATION;e.cloakRevealTimer=0;}
function ability(room,e){if(e.classId==='heavy')activateFortify(e);else if(e.classId==='assassin')activateCloak(e);else if(e.classId==='footman'||e.classId==='medic')triggerRepulsor(room,e);}
function deactivateUtility(e,kind){if(kind==='jammer'&&e.jammerActive){e.jammerActive=false;e.jammerReactivationCd=SERGEANT_UTILITY_REACTIVATION;}if(kind==='sensors'&&e.sensorsActive){e.sensorsActive=false;e.sensorsReactivationCd=SERGEANT_UTILITY_REACTIVATION;}}
function swapWeapon(e){if(e.classId==='heavy'){e.flameCharge=0;e.heavyPrimary=e.heavyPrimary==='machinegun'?'cannon':e.heavyPrimary==='cannon'?'flamethrower':'machinegun';}else if(e.classId==='footman')e.footmanSecondary=e.footmanSecondary==='blaster'?'shotgun':'blaster';else if(e.classId==='assassin')e.assassinSecondary=e.assassinSecondary==='knife'?'physicalPistol':'knife';else if(e.classId==='sergeant'){deactivateUtility(e,'jammer');deactivateUtility(e,'sensors');e.sergeantUtility=e.sergeantUtility==='jammer'?'sensors':'jammer';}}
function teleportNear(room,e,dest){for(const r of [28,38,50,64])for(let i=0;i<12;i++){const a=i*Math.PI*2/12,x=dest.x+Math.cos(a)*r,y=dest.y+Math.sin(a)*r;if(!hitsWall(x,y,e.r)&&!hitsAnyGenerator(room,x,y,e.r)){e.x=x;e.y=y;e.vx=e.vy=0;return true;}}return false;}
function summon(room,e,targetId){
  const t=room.players.get(targetId);
  const cost=t?.carryingFlagTeam?150:SERGEANT_SUMMON_COST;
  if(e.classId!=='sergeant'||!t||!t.alive||t.team!==e.team||t===e||e.energy<cost||isJammed(room,e)||isJammed(room,t))return false;
  e.energy-=cost;
  teleportNear(room,t,e);
  emitGameEvent(room,{kind:'teleport',actorId:e.id,targetId:t.id,x:e.x,y:e.y,cost});
  return true;
}
function teleportToSergeant(room,e,targetId){
  const t=room.players.get(targetId);
  const cost=SERGEANT_TELEPORT_COST*(e.carryingFlagTeam?1.5:1);
  if(!t||!t.alive||t.team!==e.team||t.classId!=='sergeant'||e.energy<cost||isJammed(room,e))return false;
  e.energy-=cost;
  teleportNear(room,e,t);
  emitGameEvent(room,{kind:'teleport',actorId:e.id,targetId:t.id,x:t.x,y:t.y,cost});
  return true;
}
function beginClassChange(room,e,classId){
  if(!CLASSES[classId]||classId===e.classId||e.energy<e.maxEnergy-.001||!e.alive)return;
  if(e.carryingFlagTeam)dropFlag(room,e);
  e.classChangeTarget=classId;e.classChangeTimer=3;e.classChangeStartX=e.x;e.classChangeStartY=e.y;
}

function processCommands(room,e){while(e.commandQueue.length){const c=e.commandQueue.shift();if(c.kind==='swap')swapWeapon(e);else if(c.kind==='ability')ability(room,e);else if(c.kind==='heal_start')beginHeal(room,e);else if(c.kind==='radar'&&e.alive){e.radarTimer=5;emitGameEvent(room,{kind:'radar',actorId:e.id,x:e.x,y:e.y});}else if(c.kind==='summon')summon(room,e,c.targetId);else if(c.kind==='teleport')teleportToSergeant(room,e,c.targetId);else if(c.kind==='class_change')beginClassChange(room,e,c.classId);else if(c.kind==='switchTeam'&&!e.isBot){const dest=opposingTeam(e.team),bot=findBotSlot(room,dest);if(bot){const oldTeam=e.team,oldIndex=e.slotIndex,newIndex=bot.slotIndex;room.players.delete(bot.id);room.players.delete(e.id);const replacement=makeBot(room,oldTeam,oldIndex);room.players.set(replacement.id,replacement);e.team=dest;e.slotIndex=newIndex;const s=spawnFor(room,dest,e.r,newIndex);e.x=s.x;e.y=s.y;e.vx=e.vy=0;e.angle=dest==='blue'?0:Math.PI;room.players.set(e.id,e);}}}}

function updateTimers(e){const rd=weaponRateDt(e);for(const k of ['fireCd','blasterCd','shotgunCd','grenadeCd','medicPistolCd','healCd','machineCd','machineBurstTimer','cannonCd','utilityCd','zapperCd','rifleBurstTimer','plasmaSmgBurstTimer','flameCd'])e[k]=Math.max(0,(e[k]||0)-rd);for(const k of ['repulsorCd','repulsorRechargeTimer','fortifyCd','jammerReactivationCd','sensorsReactivationCd','zappedWeaponSwitchLock'])e[k]=Math.max(0,(e[k]||0)-DT);if((e.repulsorRechargeTimer||0)<=0&&(e.repulsorCharges??REPULSOR_MAX_CHARGES)<REPULSOR_MAX_CHARGES){e.repulsorCharges=REPULSOR_MAX_CHARGES;e.repulsorCd=0;}e.knifeAnim=Math.max(0,e.knifeAnim-DT);e.radarTimer=Math.max(0,e.radarTimer-DT);e.flameStackAge=(e.flameStackAge??1)+DT;if(e.flameStackAge>=1)e.flameStacks=0;if(e.fortifyTimer>0){e.fortifyTimer=Math.max(0,e.fortifyTimer-DT);if(e.fortifyTimer<=0)e.fortifyShield=0;}else e.fortifyShield=0;if(e.cloakTimer>0){e.cloakTimer=Math.max(0,e.cloakTimer-DT);e.cloakRevealTimer=Math.max(0,e.cloakRevealTimer-DT);}else e.cloakRevealTimer=0;tickBlasterCycle(e);}
function primaryKind(e){if(e.classId==='heavy')return e.heavyPrimary;if(e.classId==='footman')return'rifle';if(e.classId==='assassin')return'plasmaSMG';return'medicGun';}
function secondaryKind(e){if(e.classId==='heavy')return'physicalPistol';if(e.classId==='footman')return e.footmanSecondary;if(e.classId==='assassin')return e.assassinSecondary;return'plasmaPistol';}
function utilityKind(e){if(e.classId==='assassin')return'zapper';if(e.classId==='medic')return'heal';if(e.classId==='sergeant')return e.sergeantUtility;return'grenade';}
function fireRifle(room,e){const w=WEAPON_STATS.rifle,wants=e.input.lmb;if(e.isBot){if(wants&&e.fireCd<=0&&e.rifleBurstLeft===0){e.rifleBurstLeft=w.burstCount;e.rifleBurstTimer=0;}}else{if(!wants)e.rifleTriggerLatch=false;if(wants&&!e.rifleTriggerLatch){e.rifleTriggerLatch=true;if(e.fireCd<=0&&e.rifleBurstLeft===0){e.rifleBurstLeft=w.burstCount;e.rifleBurstTimer=0;}}}if(e.rifleBurstLeft>0&&e.rifleBurstTimer<=0){addBullet(room,e,e.angle,w.speed,w.damage,{type:'physical',color:'#ffe37b',r:w.radius,rifleBullet:true,weaponKind:'rifle'});noteFired(e,1);e.rifleBurstLeft--;if(e.rifleBurstLeft>0)e.rifleBurstTimer=w.burstGap;else e.fireCd=w.cooldown;}}
function fireMG(room,e){const w=WEAPON_STATS.machinegun,still=Math.hypot(e.vx,e.vy)<8;if(e.input.lmb&&still){if(e.machineCharge<w.spinUp)e.machineCharge=Math.min(w.spinUp,e.machineCharge+DT);else e.machineSustainTime+=DT;}else{e.machineCharge=Math.max(0,e.machineCharge-DT*1.8);e.machineSustainTime=0;}if(e.machineCharge>=w.spinUp&&e.input.lmb&&still&&e.machineBurstTimer<=0){addBullet(room,e,e.angle+rand(-w.spread,w.spread),w.speed,w.damage,{type:'physical',color:'#ffe37b',weaponKind:'machinegun'});noteFired(e,1);e.machineBurstTimer=machineInterval(e);}}
function fireFlame(room,e){const w=WEAPON_STATS.flamethrower;if(!e.input.lmb){e.flameCharge=0;e.flameChargeSounded=false;return;}if(e.flameCharge<w.chargeTime)e.flameCharge=Math.min(w.chargeTime,e.flameCharge+DT);if(e.flameCharge>=w.chargeTime&&e.flameCd<=0){if(e.energy<w.energyCost){e.flameCharge=0;return;}e.energy-=w.energyCost;for(let i=0;i<w.pellets;i++){const centered=i-(w.pellets-1)/2,a=e.angle+centered*w.spread+rand(-w.spread*.24,w.spread*.24);addBullet(room,e,a,w.speed*rand(.88,1.08),w.damage,{type:'flame',color:'#ff9a45',r:w.radius,life:w.life*rand(.86,1.02),energyMult:w.energyMult,hpMult:w.hpMult,flame:true,weaponKind:'flamethrower',noEvent:i>0});}noteFired(e,1);e.flameCd=w.fireInterval;}}
function fireCannon(room,e){const w=WEAPON_STATS.cannon,rise=e.input.lmb&&!e.previousInput.lmb,start=(e.isBot&&e.input.lmb)||rise;if(start&&!e.cannonCharging&&e.cannonCd<=0&&e.energy>=w.energyCost){e.cannonCharging=true;e.cannonCharge=0;emitGameEvent(room,{kind:'cannon_charge',actorId:e.id,x:e.x,y:e.y});}if(e.cannonCharging){const movement=Math.abs(e.input.strafe)>.05||Math.abs(e.input.forward)>.05;if(movement||e.energy<w.energyCost){e.cannonCharging=false;e.cannonCharge=0;}else{e.cannonCharge+=DT;if(e.cannonCharge>=w.chargeTime){e.energy-=w.energyCost;e.cannonCharging=false;e.cannonCharge=0;e.cannonCd=w.cooldown;addBullet(room,e,e.angle,w.speed,0,{type:'energy',color:'#ff4c4c',r:w.radius,life:w.life,bouncesLeft:w.bounces,cannonBall:true,explodeRadius:w.explosionRadius,explodeDamage:w.explosionDamage,weaponKind:'cannon'});noteFired(e,1);}}}}
function firePlasmaSMG(room,e){const w=WEAPON_STATS.plasmaSMG;if(e.input.lmb&&e.fireCd<=0&&e.plasmaSmgBurstLeft===0&&e.energy>=w.energyCost){e.plasmaSmgBurstLeft=w.burstCount;e.plasmaSmgBurstTimer=0;}if(e.plasmaSmgBurstLeft>0&&e.plasmaSmgBurstTimer<=0){if(e.energy>=w.energyCost){e.energy-=w.energyCost;addBullet(room,e,e.angle+rand(-w.spread,w.spread),w.speed,w.damage,{type:'energy',color:'#54ff78',energyMult:w.energyMult,hpMult:w.hpMult,r:w.radius,life:w.life,plasma:true,plasmaSMG:true,weaponKind:'plasmaSMG'});noteFired(e,1);e.plasmaSmgBurstLeft--;if(e.plasmaSmgBurstLeft>0)e.plasmaSmgBurstTimer=w.burstGap;else e.fireCd=w.burstCooldown;}else{e.plasmaSmgBurstLeft=0;e.fireCd=w.burstCooldown;}}}
function fireCarbine(room,e){const w=WEAPON_STATS.medicGun;if(e.input.lmb&&e.fireCd<=0&&e.rifleBurstLeft===0){e.rifleBurstLeft=w.burstCount;e.rifleBurstTimer=0;e.fireCd=w.cooldown;}if(e.rifleBurstLeft>0&&e.rifleBurstTimer<=0){addBullet(room,e,e.angle,w.speed,w.damage,{type:'physical',color:'#ffe37b',r:w.radius,life:w.life,weaponKind:'medicGun'});noteFired(e,1);e.rifleBurstLeft--;e.rifleBurstTimer=w.burstGap;}}
function firePrimary(room,e){if(!canUseSlot(e,1))return;const k=primaryKind(e);if(k==='rifle')fireRifle(room,e);else if(k==='machinegun')fireMG(room,e);else if(k==='flamethrower')fireFlame(room,e);else if(k==='cannon')fireCannon(room,e);else if(k==='plasmaSMG')firePlasmaSMG(room,e);else fireCarbine(room,e);}
function fireSecondary(room,e){if(!e.input.rmb||!canUseSlot(e,2))return;const k=secondaryKind(e);if(k==='shotgun'){const w=WEAPON_STATS.shotgun;if(e.shotgunCd<=0){emitGameEvent(room,{kind:'weapon_fired',actorId:e.id,team:e.team,weapon:'shotgun',x:e.x,y:e.y,angle:e.angle});for(let i=0;i<w.pellets;i++)addBullet(room,e,e.angle+(i-4)*w.spreadStep+rand(-.008,.008),w.speed,w.damage,{type:'physical',color:'#ffd98a',r:3,life:w.life,fade:true,falloffStart:w.falloffStart,falloffEnd:w.falloffEnd,minScale:w.minScale,weaponKind:'shotgun',noEvent:true});e.shotgunCd=w.cooldown;noteFired(e,2);}}else if(k==='blaster'){const w=WEAPON_STATS.blaster;if(e.blasterCd<=0&&canFireBlaster(e)&&e.energy>=w.energyCost){e.energy-=w.energyCost;addBullet(room,e,e.angle,w.speed,w.damage,{type:'energy',color:'#74d8ff',longBeam:true,energyMult:w.energyMult,hpMult:w.hpMult,regenSlowDuration:w.regenSlowDuration,bouncesLeft:w.bounces,life:w.life,weaponKind:'blaster'});noteBlaster(e);e.blasterCd=w.cooldown;noteFired(e,2);}}else if(k==='physicalPistol'){const w=WEAPON_STATS.physicalPistol;if(e.utilityCd<=0){addBullet(room,e,e.angle,w.speed,w.damage,{type:'physical',color:'#ffd98a',r:w.radius,life:w.life,weaponKind:'physicalPistol'});e.utilityCd=w.cooldown;noteFired(e,2);}}else if(k==='knife'){const w=WEAPON_STATS.knife;if(e.utilityCd<=0){e.utilityCd=w.cooldown;e.knifeAnim=.24;emitGameEvent(room,{kind:'weapon_fired',actorId:e.id,team:e.team,weapon:'knife',x:e.x,y:e.y,angle:e.angle});let t=null,d0=Infinity;for(const q of room.players.values()){if(!q.alive||q.team===e.team)continue;const d=distance(e,q);if(d<w.range+q.r&&d<d0&&!lineBlocked(e.x,e.y,q.x,q.y)){t=q;d0=d;}}if(t){applyDamage(room,t,w.damage,{energyMult:w.energyMult,hpMult:w.hpMult});if(t.hp<=0)killEntity(room,t,e);}const g=room.generators.find(g=>g.team!==e.team);if(g&&!g.destroyed&&pointRectDistance(e.x,e.y,g)<=w.range)damageGenerator(room,g,w.damage,'knife',e.x,e.y);noteFired(e,2);}}else if(k==='plasmaPistol'){const w=WEAPON_STATS.plasmaPistol;if(e.medicPistolCd<=0&&e.energy>=w.energyCost){e.energy-=w.energyCost;addBullet(room,e,e.angle,w.speed,w.damage,{type:'energy',color:'#6dff7e',energyMult:w.energyMult,hpMult:w.hpMult,r:w.radius,life:w.life,plasma:true,weaponKind:'plasmaPistol'});e.medicPistolCd=w.cooldown;noteFired(e,2);}}}
function beginHeal(room,e){
  const cost=e.maxEnergy*.20;
  if(e.classId!=='medic'||!e.alive||e.healCharging||e.healCd>0||e.energy<cost)return false;
  e.healCharging=true;e.healCharge=0;
  emitGameEvent(room,{kind:'heal_start',actorId:e.id,x:e.x,y:e.y});
  return true;
}
function fireUtility(room,e){if(!canUseSlot(e,3))return;const k=utilityKind(e);if(k!=='heal'&&!e.input.mmb)return;if(k==='grenade'){if(e.grenadeCd<=0&&e.grenadesRemaining>0){throwGrenade(room,e);e.grenadeCd=1.65;noteFired(e,3);}}else if(k==='zapper'){const w=WEAPON_STATS.zapper;if(e.grenadeCd<=0&&e.energy>=w.energyCost){e.energy-=w.energyCost;addBullet(room,e,e.angle,w.speed,w.damage,{type:'energy',color:'#ff4d5a',energyMult:w.energyMult,hpMult:w.hpMult,r:w.radius,life:w.life,zapper:true,slowDuration:w.slowDuration,zapRechargeExtra:w.zapRechargeExtra,weaponKind:'zapper'});e.grenadeCd=w.cooldown;noteFired(e,3);}}else if(k==='heal'){const cost=e.maxEnergy*.20,rise=e.input.mmb&&!e.previousInput.mmb;if(rise)beginHeal(room,e);if(e.healCharging){const moving=Math.abs(e.input.strafe)>.05||Math.abs(e.input.forward)>.05;if(moving||e.energy<cost){e.healCharging=false;e.healCharge=0;}else{e.healCharge+=DT;if(e.healCharge>=2){e.energy-=cost;e.healCd=4;e.healCharging=false;e.healCharge=0;emitGameEvent(room,{kind:'heal',actorId:e.id,x:e.x,y:e.y});room.effects.push({id:'E'+(++nextEffectId),kind:'heal',sourceId:e.id,x:e.x,y:e.y,r:92,life:2,maxLife:2});queueHeal(room,e,33,2,e);for(const q of livingTeam(room,e.team)){if(q!==e&&distance(e,q)<100)queueHeal(room,q,lineBlocked(e.x,e.y,q.x,q.y)?16.5:33,2,e);}noteFired(e,3);}}}}else if(k==='jammer'){if(!e.previousInput.mmb){if(e.jammerActive)deactivateUtility(e,'jammer');else if(e.jammerReactivationCd<=0){e.sensorsActive=false;e.jammerActive=true;}noteFired(e,3);}}else if(k==='sensors'){if(!e.previousInput.mmb){if(e.sensorsActive)deactivateUtility(e,'sensors');else if(e.sensorsReactivationCd<=0){e.jammerActive=false;e.sensorsActive=true;}noteFired(e,3);}}}
function queueHeal(room,t,amount,duration,source){const stacked=room.healJobs.some(h=>h.targetId===t.id&&h.sourceId!==source.id&&h.remaining>0);const a=amount*(stacked?.5:1);room.healJobs.push({targetId:t.id,sourceId:source.id,remaining:duration,rate:a/duration});}

function botEnemyGenerator(room,e){return room.generators.find(g=>g.team!==e.team&&!g.destroyed);}
function botProbeBlocked(room,e,ang,dist=58){const x=e.x+Math.cos(ang)*dist,y=e.y+Math.sin(ang)*dist;return !!hitsWall(x,y,e.r+2)||!!hitsAnyGenerator(room,x,y,e.r+2);}
function chooseBotExploreWaypoint(room,e,gen){
  const dir=e.team==='blue'?1:-1;
  const laneYs=[210,375,550,725,890];
  const step=(e.aiExploreStep||0)+1;
  const lane=laneYs[(e.slotIndex+step)%laneYs.length]+rand(-28,28);
  const gx=gen?gen.x+gen.w/2:(e.team==='blue'?1550:250);
  let x=e.x+dir*rand(150,260);
  if(dir>0)x=Math.min(x,gx-95);else x=Math.max(x,gx+95);
  x=clamp(x,90,WORLD.w-90);
  let y=clamp(lane,90,WORLD.h-90);
  // If the planned point sits inside cover, slide through nearby lane options.
  for(let i=0;i<laneYs.length;i++){
    const yy=clamp(laneYs[(e.slotIndex+step+i)%laneYs.length]+rand(-18,18),90,WORLD.h-90);
    if(!hitsWall(x,yy,e.r+3)&&!hitsAnyGenerator(room,x,yy,e.r+3)){y=yy;break;}
  }
  e.aiExploreX=x;e.aiExploreY=y;e.aiExploreTimer=rand(2.2,4.4);e.aiExploreStep=step;
}
function botTravelAngle(room,e,tx,ty){
  const desired=Math.atan2(ty-e.y,tx-e.x);
  if((e.aiAvoidTimer||0)<=0&&!botProbeBlocked(room,e,desired))return desired;
  const preferred=e.aiAvoidSide||1;
  let best=desired,bestScore=Infinity;
  for(const off of [.42,.72,1.02,1.34,1.58]){
    for(const side of [preferred,-preferred]){
      const a=desired+off*side;
      if(botProbeBlocked(room,e,a))continue;
      const px=e.x+Math.cos(a)*70,py=e.y+Math.sin(a)*70;
      const score=Math.hypot(tx-px,ty-py)+(side===preferred?0:8)+off*5;
      if(score<bestScore){bestScore=score;best=a;}
    }
  }
  return best;
}
function updateBotAI(room,e){
  if(!e.isBot||!e.alive)return;

  // Detect little/no progress while trying to move and briefly commit to one
  // side of the obstruction instead of oscillating against a wall.
  const wasTrying=Math.abs(e.input.forward||0)>.18||Math.abs(e.input.strafe||0)>.18;
  e.aiNavCheck=(e.aiNavCheck||0)-DT;
  e.aiAvoidTimer=Math.max(0,(e.aiAvoidTimer||0)-DT);
  if(e.aiNavCheck<=0){
    const moved=Math.hypot(e.x-(e.aiLastX??e.x),e.y-(e.aiLastY??e.y));
    if(wasTrying&&moved<5){e.aiAvoidTimer=1.25;e.aiAvoidSide=(e.aiAvoidSide||1)*-1;e.aiExploreTimer=0;}
    e.aiLastX=e.x;e.aiLastY=e.y;e.aiNavCheck=.55;
  }

  const t=nearestVisibleEnemy(room,e),gen=botEnemyGenerator(room,e);
  e.input.lmb=e.input.rmb=e.input.mmb=e.input.sprint=false;
  e.input.forward=0;e.input.strafe=0;

  if(t){
    const dx=t.x-e.x,dy=t.y-e.y,d=Math.hypot(dx,dy)||1;
    e.input.aim=Math.atan2(dy,dx);
    const desired=e.classId==='heavy'?Math.max(70,WEAPON_STATS.flamethrower.range-5):e.classId==='assassin'?130:260;
    e.input.forward=(d>desired?1:d<desired*.55?-1:0)*.72;
    e.input.strafe=d<320?Math.sin(room.tick*.035+e.slotIndex)*.45:0;

    e.input.lmb=d<500;
    if(e.classId==='footman')e.input.rmb=d<330&&Math.random()<DT*.25;
    if(e.classId==='heavy'){
      if(d<=WEAPON_STATS.flamethrower.range+5)e.heavyPrimary='flamethrower';
      else if(d>330&&e.energy>=WEAPON_STATS.cannon.energyCost&&Math.random()<DT*.08)e.heavyPrimary='cannon';
      else e.heavyPrimary='machinegun';
    }
    if(e.classId==='assassin'){
      e.input.mmb=d>=70&&d<WEAPON_STATS.zapper.range&&Math.random()<DT*.15;
      e.input.rmb=d<WEAPON_STATS.knife.range+10;
    }
    if(e.classId==='medic'||e.classId==='sergeant')e.input.rmb=d<225&&Math.random()<DT*.12;
  }else{
    // Explore forward lanes instead of staring into a wall on the direct
    // generator line. Once the generator is actually visible, stop and fire.
    const gx=gen?gen.x+gen.w/2:WORLD.w/2,gy=gen?gen.y+gen.h/2:WORLD.h/2;
    const gd=gen?Math.hypot(gx-e.x,gy-e.y):Infinity;
    const clearGen=!!gen&&!lineBlocked(e.x,e.y,gx,gy);
    if(clearGen&&gd<480){
      e.input.aim=Math.atan2(gy-e.y,gx-e.x);
      e.input.lmb=true;
      e.input.forward=gd>260?.55:0;
    }else{
      e.aiExploreTimer=(e.aiExploreTimer||0)-DT;
      if(e.aiExploreX==null||e.aiExploreY==null||e.aiExploreTimer<=0||Math.hypot(e.aiExploreX-e.x,e.aiExploreY-e.y)<55)chooseBotExploreWaypoint(room,e,gen);
      const a=botTravelAngle(room,e,e.aiExploreX,e.aiExploreY);
      e.input.aim=a;
      e.input.forward=.82;
      if((e.aiAvoidTimer||0)>0)e.input.strafe=(e.aiAvoidSide||1)*.28;
      e.input.sprint=e.energy>e.maxEnergy*.72&&Math.random()<DT*.45;
    }
  }

  const d=t?distance(e,t):Infinity;
  if(e.classId==='heavy'&&e.fortifyCd<=0&&e.energy>=100&&t&&d<300&&Math.random()<DT*.08)activateFortify(e);
  if(e.classId==='assassin'&&e.cloakTimer<=0&&e.energy>=100&&!e.carryingFlagTeam&&t&&d<450&&Math.random()<DT*.05)activateCloak(e);
  if((e.classId==='footman'||e.classId==='medic')&&e.repulsorCd<=0&&(e.repulsorCharges??REPULSOR_MAX_CHARGES)>0&&e.energy>=75&&t&&d<100&&Math.random()<DT*.2)triggerRepulsor(room,e);
  if(e.classId==='medic'){
    const wounded=livingTeam(room,e.team).find(q=>q.hp<q.maxHp&&distance(e,q)<100);
    if(wounded&&e.healCd<=0&&e.energy>=e.maxEnergy*.20){e.input.lmb=false;e.input.rmb=false;e.input.mmb=true;e.input.forward=0;e.input.strafe=0;}
  }
  if(e.classId==='sergeant'&&t){
    if(d<250&&e.jammerReactivationCd<=0){if(e.sensorsActive)deactivateUtility(e,'sensors');e.jammerActive=true;}
    else if(e.sensorsReactivationCd<=0){if(e.jammerActive)deactivateUtility(e,'jammer');e.sensorsActive=true;}
  }
}

function updateClassChange(room,e){if(!e.classChangeTarget)return;if(!e.alive||e.energy<e.maxEnergy-.001||Math.hypot(e.x-e.classChangeStartX,e.y-e.classChangeStartY)>1.5){e.classChangeTarget=null;e.classChangeTimer=0;return;}e.classChangeTimer=Math.max(0,e.classChangeTimer-DT);if(e.classChangeTimer<=0){const id=e.classChangeTarget;e.classChangeTarget=null;e.pendingClassId=id;e.energy=0;applyClass(e,id,true);e.energy=0;resetCombatState(e);const s=spawnFor(room,e.team,e.r,e.slotIndex);e.x=s.x;e.y=s.y;}}
function updateEntity(room,e){processCommands(room,e);updateTimers(e);if(!e.ready)return;if(!e.alive){e.deadTimer-=DT;if(e.deadTimer<=0)respawnEntity(room,e);return;}updateBotAI(room,e);updateClassChange(room,e);if(e.classChangeTarget){e.input.forward=e.input.strafe=0;e.input.lmb=e.input.rmb=e.input.mmb=false;}
  e.lastHit+=DT;e.slowTimer=Math.max(0,e.slowTimer-DT);e.zapTimer=Math.max(0,e.zapTimer-DT);e.zapVisualTimer=Math.max(0,e.zapVisualTimer-DT);e.regenSlowTimer=Math.max(0,e.regenSlowTimer-DT);
  const wait=4+(e.zapRechargeExtra||0);if(e.lastHit>=wait){e.zapRechargeExtra=0;if(!e.sprinting&&e.energy<e.maxEnergy){let m=e.regenSlowTimer>0?.35:1;if(e.classId==='sergeant'&&e.zapTimer<=0){if(e.jammerActive)m*=.05;else if(e.sensorsActive)m*=.5;}e.energy=Math.min(e.maxEnergy,e.energy+e.energyRegen*m*DT);}}
  const status=e.slowTimer>0?.25:1,flameActive=e.classId==='heavy'&&e.heavyPrimary==='flamethrower'&&e.input.lmb&&e.flameCharge>=WEAPON_STATS.flamethrower.chargeTime&&e.energy>=WEAPON_STATS.flamethrower.energyCost,turn=(e.classId==='heavy'?1.225:1.47)*(e.zapTimer>0?.10:1)*(flameActive?.5:1);e.angle=approachAngle(e.angle,e.input.aim,turn*DT);
  if(e.knockbackTimer>0){e.knockbackTimer=Math.max(0,e.knockbackTimer-DT);moveWithWalls(room,e,e.vx*DT,e.vy*DT);e.vx*=Math.max(0,1-2.8*DT);e.vy*=Math.max(0,1-2.8*DT);}else{let st=clamp(e.input.strafe,-1,1),fw=clamp(e.input.forward,-1,1),mag=Math.hypot(st,fw);if(mag>1){st/=mag;fw/=mag;mag=1;}const sprint=e.input.sprint&&mag>.05&&e.energy>0,eFort=e.fortifyTimer>0?.2:1,eFlame=flameActive?.5:1,back=fw<-.05?.8:1;if(mag>.05){const fx=Math.cos(e.angle),fy=Math.sin(e.angle),rx=-fy,ry=fx;e.vx+=(fx*fw+rx*st)*e.accel*(sprint?1.35:1)*status*eFort*DT;e.vy+=(fy*fw+ry*st)*e.accel*(sprint?1.35:1)*status*eFort*DT;}else{const dec=Math.max(0,1-e.drag*DT);e.vx*=dec;e.vy*=dec;}e.sprinting=sprint;if(sprint){const flagSprintMult=e.carryingFlagTeam?1.35:1;e.energy=Math.max(0,e.energy-e.maxEnergy*.08*flagSprintMult*DT);}const max=e.maxSpeed*(sprint?1.6:1)*status*eFort*eFlame*back,sp=Math.hypot(e.vx,e.vy);if(sp>max){e.vx=e.vx/sp*max;e.vy=e.vy/sp*max;}moveWithWalls(room,e,e.vx*DT,e.vy*DT);}
  if(!e.classChangeTarget){if(e.cannonCharging)fireCannon(room,e);else if(e.healCharging)fireUtility(room,e);else if(e.input.lmb)firePrimary(room,e);else if(e.input.rmb)fireSecondary(room,e);else if(e.input.mmb)fireUtility(room,e);else{if(primaryKind(e)==='machinegun'){e.machineCharge=Math.max(0,e.machineCharge-DT*1.8);e.machineSustainTime=0;}if(primaryKind(e)==='flamethrower')e.flameCharge=0;}}
  e.previousInput={lmb:e.input.lmb,rmb:e.input.rmb,mmb:e.input.mmb};
}

function updateBullets(room){for(let i=room.bullets.length-1;i>=0;i--){const b=room.bullets[i],px=b.x,py=b.y;b.x+=b.vx*DT;b.y+=b.vy*DT;b.life-=DT;if(b.life<=0||b.x<0||b.y<0||b.x>WORLD.w||b.y>WORLD.h){if(b.cannonBall)explodeCannon(room,b);room.bullets.splice(i,1);continue;}markGeneratorWallPass(room,b);const wall=hitsWallForBullet(room,b);if(wall){if(b.bouncesLeft>0){const dl=Math.abs(px-wall.x),dr=Math.abs(px-(wall.x+wall.w)),dt=Math.abs(py-wall.y),db=Math.abs(py-(wall.y+wall.h)),m=Math.min(dl,dr,dt,db);b.x=px;b.y=py;if(m===dl||m===dr)b.vx*=-1;else b.vy*=-1;b.bouncesLeft--;continue;}if(b.cannonBall)explodeCannon(room,b);room.bullets.splice(i,1);continue;}
    const own=room.generators.find(g=>g.team===b.team&&!g.destroyed);if(own&&circleHitsGenerator(b.x,b.y,b.r,own)){if(b.cannonBall)explodeCannon(room,b);room.bullets.splice(i,1);continue;}
    const gen=room.generators.find(g=>g.team!==b.team&&!g.destroyed);if(gen&&circleHitsGenerator(b.x,b.y,b.r,gen)){if(b.cannonBall)explodeCannon(room,b);else damageGenerator(room,gen,b.damage*bulletScale(b),b.zapper?'zapper':'projectile',b.x,b.y,b.flame);room.bullets.splice(i,1);continue;}
    let hit=false;for(const q of room.players.values()){if(!q.alive||q.team===b.team)continue;if(Math.hypot(b.x-q.x,b.y-q.y)<b.r+q.r){if(b.cannonBall)explodeCannon(room,b);else{let dmg=b.damage*bulletScale(b);if(b.flame)dmg=flameDamage(q,dmg);applyDamage(room,q,dmg,{energyMult:b.energyMult,hpMult:b.hpMult,slowDuration:b.slowDuration,zapRechargeExtra:b.zapRechargeExtra,regenSlowDuration:b.regenSlowDuration});emitGameEvent(room,{kind:'hit',targetId:q.id,shielded:q.energy>0,x:q.x,y:q.y});if(q.hp<=0)killEntity(room,q,room.players.get(b.ownerId));}room.bullets.splice(i,1);hit=true;break;}}if(hit)continue;}}
function updateGrenades(room){for(let i=room.grenades.length-1;i>=0;i--){const g=room.grenades[i];g.fuse-=DT;g.playerBounceCd=Math.max(0,g.playerBounceCd-DT);if(!g.embeddedGeneratorId){const nx=g.x+g.vx*DT,ny=g.y+g.vy*DT,gen=room.generators.find(x=>x.team!==g.team);if(gen&&grenadeWeak(g,gen,nx,ny)){g.embeddedGeneratorId=gen.team;g.x=gen.backDoor.side==='west'?gen.x+g.r+4:gen.x+gen.w-g.r-4;g.y=clamp(ny,gen.y+g.r+3,gen.y+gen.h-g.r-3);g.vx=g.vy=0;}else{if(!hitsWall(nx,g.y,g.r)&&!hitsAnyGenerator(room,nx,g.y,g.r))g.x=nx;else g.vx*=-.62;if(!hitsWall(g.x,ny,g.r)&&!hitsAnyGenerator(room,g.x,ny,g.r))g.y=ny;else g.vy*=-.62;}}
    if(!g.embeddedGeneratorId&&g.playerBounceCd<=0){for(const q of room.players.values()){if(!q.alive||q.team===g.team)continue;const dx=g.x-q.x,dy=g.y-q.y,d=Math.hypot(dx,dy),min=g.r+q.r;if(d>0&&d<min){const nx=dx/d,ny=dy/d,inc=Math.hypot(g.vx,g.vy),dot=g.vx*nx+g.vy*ny;g.x=q.x+nx*(min+.5);g.y=q.y+ny*(min+.5);if(dot<0){g.vx-=2*dot*nx;g.vy-=2*dot*ny;const rs=Math.hypot(g.vx,g.vy)||1;g.vx=g.vx/rs*inc*.25;g.vy=g.vy/rs*inc*.25;}else{g.vx=nx*inc*.25;g.vy=ny*inc*.25;}g.playerBounceCd=.08;break;}}}
    if(!g.embeddedGeneratorId){g.vx*=Math.max(0,1-.95*DT);g.vy*=Math.max(0,1-.95*DT);}if(g.fuse<=0){emitGameEvent(room,{kind:'grenade_explosion',actorId:g.ownerId,x:g.x,y:g.y});room.effects.push({id:'E'+(++nextEffectId),kind:'grenade',x:g.x,y:g.y,r:76,life:.24,maxLife:.24});const gen=room.generators.find(x=>x.team!==g.team&&!x.destroyed);if(gen){if(g.embeddedGeneratorId===gen.team)damageGenerator(room,gen,170,'grenade',g.x,g.y);else{const d=pointRectDistance(g.x,g.y,gen);if(d<=76&&!lineBlocked(g.x,g.y,gen.x+gen.w/2,gen.y+gen.h/2))damageGenerator(room,gen,grenadeDamage(d),'grenade',g.x,g.y);}}for(const q of room.players.values()){if(!q.alive||q.team===g.team)continue;const d=Math.max(0,Math.hypot(q.x-g.x,q.y-g.y)-q.r);if(d<=76&&!lineBlocked(g.x,g.y,q.x,q.y)){applyDamage(room,q,grenadeDamage(d),{energyMult:.2,hpMult:1});if(q.hp<=0)killEntity(room,q,room.players.get(g.ownerId));}}room.grenades.splice(i,1);}}}
function updateHealJobs(room){for(let i=room.healJobs.length-1;i>=0;i--){const h=room.healJobs[i],t=room.players.get(h.targetId),s=room.players.get(h.sourceId);if(!t||!t.alive||!s||!s.alive){room.healJobs.splice(i,1);continue;}t.hp=Math.min(t.maxHp,t.hp+h.rate*DT);h.remaining-=DT;if(h.remaining<=0||t.hp>=t.maxHp)room.healJobs.splice(i,1);}}
function updateHealingNode(room){for(const e of room.players.values()){if(!e.alive){e.healingNodeTimer=0;continue;}const d=Math.hypot(e.x-HEALING_NODE.x,e.y-HEALING_NODE.y);if(d<=HEALING_NODE.radius+e.r&&e.lastHit>=HEALING_NODE.safeDelay&&e.hp<e.maxHp){e.healingNodeTimer+=DT;if(e.healingNodeTimer>=HEALING_NODE.healInterval){e.healingNodeTimer-=HEALING_NODE.healInterval;e.hp=Math.min(e.maxHp,e.hp+1);}}else e.healingNodeTimer=0;}}
function updateFlags(room){
  for(const f of room.flags){
    if(f.carrierId){const c=room.players.get(f.carrierId);if(!c||!c.alive){f.carrierId=null;f.dropped=true;f.returnTimer=45;}else{f.x=c.x;f.y=c.y;}}
    else if(f.dropped){f.returnTimer-=DT;if(f.returnTimer<=0){f.x=f.spawnX;f.y=f.spawnY;f.dropped=false;}}
  }
  for(const e of room.players.values()){
    if(!e.alive)continue;
    if(!e.carryingFlagTeam){
      const f=room.flags.find(f=>f.team!==e.team&&!f.carrierId);
      if(f&&Math.hypot(e.x-f.x,e.y-f.y)<=30){
        f.carrierId=e.id;f.dropped=false;e.carryingFlagTeam=f.team;
        // A flag carrier can never remain cloaked.
        e.cloakTimer=0;e.cloakRevealTimer=0;
        emitGameEvent(room,{kind:'flag_taken',actorId:e.id,team:e.team,flagTeam:f.team});
      }
    }
    if(e.carryingFlagTeam){
      const g=room.generators.find(g=>g.team===e.team&&!g.destroyed);
      if(g&&circleHitsGenerator(e.x,e.y,e.r,g)){
        const f=room.flags.find(f=>f.team===e.carryingFlagTeam);
        if(f){f.carrierId=null;f.dropped=false;f.returnTimer=0;f.x=f.spawnX;f.y=f.spawnY;}
        e.carryingFlagTeam=null;
        if(!e.isBot)e.cash+=200;
        room.flagScore[e.team]=(room.flagScore[e.team]||0)+1;
        emitGameEvent(room,{kind:'flag_capture',actorId:e.id,team:e.team,score:room.flagScore[e.team],winScore:FLAG_WIN_SCORE});
        if(!room.winningTeam&&room.flagScore[e.team]>=FLAG_WIN_SCORE){
          room.winningTeam=e.team;room.postVictoryTimer=20;
          emitGameEvent(room,{kind:'flag_round_win',team:e.team,winningTeam:e.team,score:room.flagScore[e.team]});
        }
      }
    }
  }
}
function updateEffects(room){for(let i=room.effects.length-1;i>=0;i--){const f=room.effects[i];if(f.sourceId){const s=room.players.get(f.sourceId);if(s&&s.alive){f.x=s.x;f.y=s.y;}else{room.effects.splice(i,1);continue;}}f.life-=DT;if(f.life<=0)room.effects.splice(i,1);}for(let i=room.corpses.length-1;i>=0;i--){room.corpses[i].life-=DT;if(room.corpses[i].life<=0)room.corpses.splice(i,1);}for(const g of room.generators){g.flameStackAge=(g.flameStackAge??1)+DT;if(g.flameStackAge>=1)g.flameStacks=0;}}
function resolveOpponents(room){const a=[...room.players.values()].filter(e=>e.alive);for(let i=0;i<a.length;i++)for(let j=i+1;j<a.length;j++){const x=a[i],y=a[j];if(x.team===y.team)continue;const dx=y.x-x.x,dy=y.y-x.y,d=Math.hypot(dx,dy),min=x.r+y.r;if(d<=0||d>=min)continue;const nx=dx/d,ny=dy/d,o=min-d,ax=x.x-nx*o*.5,ay=x.y-ny*o*.5,bx=y.x+nx*o*.5,by=y.y+ny*o*.5;if(!hitsWall(ax,ay,x.r)&&!hitsAnyGenerator(room,ax,ay,x.r)){x.x=ax;x.y=ay;}if(!hitsWall(bx,by,y.r)&&!hitsAnyGenerator(room,bx,by,y.r)){y.x=bx;y.y=by;}}}

function resetMatch(room){room.generators=deepClone(GENERATOR_TEMPLATE);room.flags=deepClone(FLAG_TEMPLATE);room.flagScore={blue:0,red:0};room.bullets=[];room.grenades=[];room.healJobs=[];room.effects=[];room.corpses=[];for(const e of room.players.values()){applyClass(e,e.classId,true);resetCombatState(e);e.alive=true;e.deadTimer=0;const s=spawnFor(room,e.team,e.r,e.slotIndex);e.x=s.x;e.y=s.y;}room.winningTeam=null;room.postVictoryTimer=0;room.matchFrozen=false;room.matchRestartTimer=0;}
function returnAll(room){for(const e of room.players.values()){if(!e.alive)respawnEntity(room,e);const s=spawnFor(room,e.team,e.r,e.slotIndex);e.x=s.x;e.y=s.y;e.vx=e.vy=0;e.hp=e.maxHp;e.energy=e.maxEnergy;}room.bullets=[];room.grenades=[];room.healJobs=[];room.effects=[];room.matchFrozen=true;room.postVictoryTimer=0;room.matchRestartTimer=5;}
function serializeEntity(e,viewer){const enemy=e.team!==viewer.team,radar=viewer.radarTimer>0,hide=enemy&&!radar;return{id:e.id,slotIndex:e.slotIndex,team:e.team,isBot:e.isBot,playerName:e.isBot?(enemy?'ENEMY':e.playerName):e.playerName,classId:e.classId,pendingClassId:e.pendingClassId,x:e.x,y:e.y,vx:e.vx,vy:e.vy,angle:e.angle,r:e.r,lastHit:e.lastHit,hp:hide?1:e.hp,maxHp:hide?1:e.maxHp,energy:hide?0:e.energy,maxEnergy:hide?1:e.maxEnergy,statsHidden:hide,deadTimer:e.deadTimer,alive:e.alive,ready:e.ready,fireCd:e.fireCd,rifleBurstTimer:e.rifleBurstTimer,plasmaSmgBurstTimer:e.plasmaSmgBurstTimer,blasterCd:e.blasterCd,blasterCycleLock:e.blasterCycleLock,shotgunCd:e.shotgunCd,grenadeCd:e.grenadeCd,grenadesRemaining:e.grenadesRemaining,medicPistolCd:e.medicPistolCd,healCd:e.healCd,machineCharge:e.machineCharge,machineBurstTimer:e.machineBurstTimer,machineCd:e.machineCd,machineSustainTime:e.machineSustainTime,flameCharge:e.flameCharge,flameCd:e.flameCd,cannonCharge:e.cannonCharge,cannonCd:e.cannonCd,cannonCharging:e.cannonCharging,utilityCd:e.utilityCd,zapperCd:e.zapperCd,repulsorCd:e.repulsorCd,repulsorCharges:e.repulsorCharges,repulsorRechargeTimer:e.repulsorRechargeTimer,healCharge:e.healCharge,knifeAnim:e.knifeAnim,slowTimer:e.slowTimer,zapTimer:e.zapTimer,zapVisualTimer:e.zapVisualTimer,zapRechargeExtra:e.zapRechargeExtra,regenSlowTimer:e.regenSlowTimer,footmanSecondary:e.footmanSecondary,assassinSecondary:e.assassinSecondary,heavyPrimary:e.heavyPrimary,sergeantUtility:e.sergeantUtility,jammerActive:enemy?false:e.jammerActive,sensorsActive:enemy?false:e.sensorsActive,jammerReactivationCd:e.jammerReactivationCd,sensorsReactivationCd:e.sensorsReactivationCd,fortifyTimer:e.fortifyTimer,fortifyShield:e.fortifyShield,fortifyCd:e.fortifyCd,cloakTimer:e.cloakTimer,cloakRevealTimer:e.cloakRevealTimer,bounty:e.bounty,kills:e.kills,deaths:e.deaths,cash:e.cash,carryingFlagTeam:e.carryingFlagTeam,classChangeTarget:e.classChangeTarget,classChangeTimer:e.classChangeTimer};}
function snapshotFor(room,v){const players=[];for(const p of room.players.values())if(p===v||p.team===v.team||entityVisibleToViewer(room,v,p))players.push(serializeEntity(p,v));const bullets=room.bullets.filter(b=>b.team===v.team||pointVisibleToViewer(room,v,b.x,b.y));const corpses=room.corpses.filter(c=>c.team===v.team||v.radarTimer>0||livingTeam(room,v.team).some(s=>Math.hypot(c.x-s.x,c.y-s.y)<=VISION_RANGE&&!lineBlocked(s.x,s.y,c.x,c.y)));return{type:'snapshot',yourId:v.id,team:v.team,tick:room.tick,players,generators:room.generators,flags:room.flags,healingNode:HEALING_NODE,bullets,grenades:room.grenades,effects:room.effects,corpses,radar:v.radarTimer,winningTeam:room.winningTeam,postVictoryTimer:room.postVictoryTimer,matchFrozen:room.matchFrozen,matchRestartTimer:room.matchRestartTimer,flagScore:room.flagScore,flagWinScore:FLAG_WIN_SCORE,roster:{blue:teamMembers(room,'blue').map(x=>({id:x.id,name:x.isBot?'BOT':x.playerName,isBot:x.isBot,classId:x.classId,alive:x.alive})),red:teamMembers(room,'red').map(x=>({id:x.id,name:x.isBot?'BOT':x.playerName,isBot:x.isBot,classId:x.classId,alive:x.alive}))}};}
function tickRoom(room){if(room.matchFrozen){room.matchRestartTimer=Math.max(0,room.matchRestartTimer-DT);if(room.matchRestartTimer<=0)resetMatch(room);}else{room.tick++;for(const e of room.players.values())updateEntity(room,e);resolveOpponents(room);updateBullets(room);updateGrenades(room);updateHealJobs(room);updateHealingNode(room);updateFlags(room);updateEffects(room);if(room.winningTeam&&room.postVictoryTimer>0){room.postVictoryTimer=Math.max(0,room.postVictoryTimer-DT);if(room.postVictoryTimer<=0)returnAll(room);}}for(const [ws,id] of room.clients){const v=room.players.get(id);if(v)send(ws,snapshotFor(room,v));}}
setInterval(()=>{for(const room of rooms.values())tickRoom(room);},1000/TICK_RATE);

const PUBLIC_DIR=path.join(__dirname,'public');
const server=http.createServer((req,res)=>{let p=req.url.split('?')[0];if(p==='/')p='/index.html';const n=path.normalize(p).replace(/^(\.\.[/\\])+/,''),f=path.join(PUBLIC_DIR,n);if(!f.startsWith(PUBLIC_DIR)){res.writeHead(403);return res.end('Forbidden');}fs.readFile(f,(err,data)=>{if(err){res.writeHead(404);return res.end('Not found');}const ext=path.extname(f),mime={'.html':'text/html; charset=utf-8','.js':'application/javascript; charset=utf-8','.css':'text/css; charset=utf-8'}[ext]||'application/octet-stream';res.writeHead(200,{'Content-Type':mime});res.end(data);});});
const wss=new WebSocketServer({server});
wss.on('connection',ws=>{ws.playerId='P'+nextHumanId++;ws.roomCode='';ws.on('message',raw=>{let m;try{m=JSON.parse(raw.toString());}catch{return;}if(m.type==='create_room'){leaveRoom(ws);const code=makeRoomCode(),room=makeRoom(code),p=replaceBotWithHuman(room,ws,'blue');send(ws,{type:'room_created',roomCode:code,playerId:p.id,team:p.team});return;}if(m.type==='join_room'){const code=String(m.roomCode||'').trim().toUpperCase(),room=rooms.get(code);if(!room){send(ws,{type:'error',message:'Room not found.'});return;}if(room.clients.size>=8){send(ws,{type:'error',message:'Room is full (8 human players).'});return;}leaveRoom(ws);const team=chooseJoinTeam(room),p=team?replaceBotWithHuman(room,ws,team):null;if(!p){send(ws,{type:'error',message:'No open team slot.'});return;}send(ws,{type:'room_joined',roomCode:code,playerId:p.id,team:p.team});return;}if(!ws.roomCode)return;const room=rooms.get(ws.roomCode),id=room?.clients.get(ws),p=room?.players.get(id);if(!p)return;if(m.type==='name'){const clean=String(m.name||'').trim().replace(/[<>\n\r\t]/g,'').slice(0,18);p.playerName=clean||'Player';}else if(m.type==='input'){p.input.strafe=clamp(Number(m.strafe)||0,-1,1);p.input.forward=clamp(Number(m.forward)||0,-1,1);if(Number.isFinite(Number(m.aim)))p.input.aim=Number(m.aim);p.input.lmb=!!m.lmb;p.input.rmb=!!m.rmb;p.input.mmb=!!m.mmb;p.input.sprint=!!m.sprint;}else if(m.type==='class'){if(CLASSES[m.classId]&&(!p.ready||!p.alive)){p.pendingClassId=m.classId;if(!p.ready){p.ready=true;applyClass(p,m.classId,true);p.classId=m.classId;resetCombatState(p);const s=spawnFor(room,p.team,p.r,p.slotIndex);p.x=s.x;p.y=s.y;}}}else if(m.type==='command'){const allowed=['swap','ability','radar','switchTeam','heal_start'];if(allowed.includes(m.command))p.commandQueue.push({kind:m.command});else if(m.command==='summon')p.commandQueue.push({kind:'summon',targetId:String(m.targetId||'')});else if(m.command==='teleport')p.commandQueue.push({kind:'teleport',targetId:String(m.targetId||'')});else if(m.command==='class_change')p.commandQueue.push({kind:'class_change',classId:String(m.classId||'')});}});ws.on('close',()=>leaveRoom(ws));});
server.listen(PORT,()=>console.log(`Infantry v185 4v4 authoritative multiplayer on port ${PORT}`));
