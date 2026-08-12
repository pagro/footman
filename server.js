const http = require('http');
const fs = require('fs');
const path = require('path');
const { WebSocketServer, WebSocket } = require('ws');


const WORLD = { w: 1800, h: 1100 };
const TICK_RATE = 30;
const DT = 1 / TICK_RATE;

const CLASSES = {
  footman:  { name:'Footman',  maxHp:175, maxEnergy:150, speed:47,   accel:95,  drag:2.6, regen:12, r:12 },
  heavy:    { name:'Heavy',    maxHp:200, maxEnergy:200, speed:34,   accel:72,  drag:2.9, regen:10, r:12 },
  assassin: { name:'Assassin', maxHp:125, maxEnergy:200, speed:49.6, accel:125, drag:2.3, regen:14, r:9.6 },
  medic:    { name:'Medic',    maxHp:150, maxEnergy:150, speed:50,   accel:102, drag:2.5, regen:13, r:12 }
};

const WEAPONS = {
  rifle: {
    damage:28, speed:194.4, burstCount:3, burstGap:.18, cooldown:.70,
    type:'physical', energyMult:.60, hpMult:1, life:1.8, r:3
  },
  blaster: {
    damage:34, speed:132, cooldown:1.0, type:'energy',
    energyMult:2.0, hpMult:.5, life:1.8, r:4, energyCostPct:.075,
    regenSlowDuration:3
  },
  plasmaSMG: {
    damage:15, speed:210, burstCount:4, burstGap:.08, cooldown:.65,
    type:'energy', energyMult:1.45, hpMult:.58, life:.868, r:1.35,
    energyCost:3.5
  },
  physicalPistol: {
    damage:32, speed:205, cooldown:.48, type:'physical',
    energyMult:.60, hpMult:1, life:1.15, r:2.4
  },
  knife: {
    damage:95, cooldown:.65, range:29.64, energyMult:.7, hpMult:1.5
  },
  zapper: {
    damage:12, speed:240, cooldown:10, type:'energy',
    energyMult:1.15, hpMult:.35, life:.58, r:3, energyCost:15,
    slowDuration:3, zapRechargeExtra:3
  },
  medicGun: {
    damage:20, speed:188, burstCount:2, burstGap:.22, cooldown:1.1,
    type:'physical', energyMult:.60, hpMult:1, life:1.8, r:3
  },
  plasmaPistol: {
    damage:24, speed:200, cooldown:.55, type:'energy',
    energyMult:1.5, hpMult:.6, life:1.2, r:2.2, energyCost:8
  },
  grenade: {
    fuse:2.5, throwSpeed:185, radius:76, centerDamage:170, edgeDamage:85,
    energyMult:.20, hpMult:1
  }
};

const GENERATORS = [
  {
    id:'blueGen', team:'blue', x:150,y:505,w:60,h:90,maxHp:1200,hp:1200,destroyed:false,
    backDoor:{x:202,y:528,w:12,h:44,side:'east'},
    interior:{x:60,y:350,w:360,h:400}
  },
  {
    id:'redGen', team:'red', x:1590,y:505,w:60,h:90,maxHp:1200,hp:1200,destroyed:false,
    backDoor:{x:1586,y:528,w:12,h:44,side:'west'},
    interior:{x:1380,y:350,w:360,h:400}
  }
];

const WALLS = [
  {x:40,y:330,w:400,h:20},{x:40,y:750,w:400,h:20},{x:40,y:350,w:20,h:400},
  {x:420,y:350,w:20,h:145},{x:420,y:605,w:20,h:145},
  {x:120,y:455,w:116,h:20},{x:120,y:625,w:116,h:20},{x:236,y:455,w:20,h:190},

  {x:1360,y:330,w:400,h:20},{x:1360,y:750,w:400,h:20},{x:1740,y:350,w:20,h:400},
  {x:1360,y:350,w:20,h:145},{x:1360,y:605,w:20,h:145},
  {x:1564,y:455,w:116,h:20},{x:1564,y:625,w:116,h:20},{x:1544,y:455,w:20,h:190},

  {x:548,y:524,w:50,h:50},{x:662,y:532,w:60,h:38},{x:1078,y:532,w:60,h:38},{x:1202,y:524,w:50,h:50},
  {x:720,y:166,w:74,h:24},{x:1006,y:166,w:74,h:24},{x:720,y:910,w:74,h:24},{x:1006,y:910,w:74,h:24},
  {x:584,y:608,w:42,h:42},{x:1174,y:450,w:42,h:42}
];

function clamp(v,a,b){ return Math.max(a, Math.min(b,v)); }
function dist(ax,ay,bx,by){ return Math.hypot(ax-bx, ay-by); }
function pointInRect(x,y,r){ return x>=r.x && x<=r.x+r.w && y>=r.y && y<=r.y+r.h; }
function circleHitsRect(x,y,rad,r){
  const nx=clamp(x,r.x,r.x+r.w), ny=clamp(y,r.y,r.y+r.h);
  const dx=x-nx, dy=y-ny;
  return dx*dx+dy*dy < rad*rad;
}
function circleHitsGenerator(x,y,rad,g){
  const nx=clamp(x,g.x,g.x+g.w), ny=clamp(y,g.y,g.y+g.h);
  const dx=x-nx, dy=y-ny;
  return dx*dx+dy*dy < rad*rad;
}
function hitsObstacle(x,y,r){
  for(const w of WALLS) if(circleHitsRect(x,y,r,w)) return true;
  for(const g of GENERATORS) if(!g.destroyed && circleHitsGenerator(x,y,r,g)) return true;
  return false;
}
function segmentHitsRect(x1,y1,x2,y2,r){
  let t0=0,t1=1;
  const dx=x2-x1, dy=y2-y1;
  const tests=[[-dx,x1-r.x],[dx,r.x+r.w-x1],[-dy,y1-r.y],[dy,r.y+r.h-y1]];
  for(const [p,q] of tests){
    if(Math.abs(p)<1e-9){ if(q<0) return false; }
    else{
      const t=q/p;
      if(p<0){ if(t>t1) return false; if(t>t0) t0=t; }
      else { if(t<t0) return false; if(t<t1) t1=t; }
    }
  }
  return true;
}
function lineBlocked(x1,y1,x2,y2){
  for(const w of WALLS) if(segmentHitsRect(x1,y1,x2,y2,w)) return true;
  return false;
}
function moveWithWalls(ent,dx,dy){
  const ox=ent.x, oy=ent.y;
  ent.x += dx;
  if(hitsObstacle(ent.x,ent.y,ent.r)) ent.x=ox;
  ent.y += dy;
  if(hitsObstacle(ent.x,ent.y,ent.r)) ent.y=oy;
  ent.x=clamp(ent.x,ent.r,WORLD.w-ent.r);
  ent.y=clamp(ent.y,ent.r,WORLD.h-ent.r);
}
function spawnPoint(team,r=12,index=0){
  const pts = team==='blue'
    ? [[330,550],[330,500],[330,600],[280,550]]
    : [[1470,550],[1470,500],[1470,600],[1520,550]];
  const p=pts[index%pts.length];
  if(!hitsObstacle(p[0],p[1],r)) return {x:p[0],y:p[1]};
  return team==='blue'?{x:360,y:550}:{x:1440,y:550};
}
function isGeneratorWeakHit(gen,x,y,weaponKind){
  if(!['grenade','zapper'].includes(weaponKind)) return false;
  if(!pointInRect(x,y,gen.interior)) return false;
  const cy=gen.y+gen.h/2;
  if(Math.abs(y-cy)>70) return false;
  if(gen.backDoor.side==='west') return x<=gen.x+gen.w*.45;
  return x>=gen.x+gen.w*.55;
}


const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.join(__dirname, 'public');

let nextPlayerId = 1;
let nextProjectileId = 1;
const rooms = new Map();

function makeCode(){
  const chars='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  for(let tries=0;tries<1000;tries++){
    let code='';
    for(let i=0;i<4;i++) code+=chars[Math.floor(Math.random()*chars.length)];
    if(!rooms.has(code)) return code;
  }
  throw new Error('No room code');
}

function makePlayer(id,team,index=0,isBot=false){
  const cls=CLASSES.footman;
  const sp=spawnPoint(team,cls.r,index);
  return {
    id, team, isBot, classId:'footman',
    x:sp.x,y:sp.y,vx:0,vy:0,angle:team==='blue'?0:Math.PI,r:cls.r,
    hp:cls.maxHp,maxHp:cls.maxHp,energy:cls.maxEnergy,maxEnergy:cls.maxEnergy,
    alive:true,deadTimer:0,lastHit:99,regenSlowTimer:0,slowTimer:0,zapExtra:0,
    input:{mx:0,my:0,aim:team==='blue'?0:Math.PI,primary:false,secondary:false,utility:false,sprint:false},
    cd:{primary:0,secondary:0,utility:0},
    burst:{kind:'',left:0,timer:0},
    bounty:0
  };
}

function applyClass(p,classId){
  const cls=CLASSES[classId]||CLASSES.footman;
  p.classId=classId in CLASSES?classId:'footman';
  p.maxHp=cls.maxHp; p.maxEnergy=cls.maxEnergy; p.r=cls.r;
  p.hp=Math.min(p.hp,p.maxHp); p.energy=Math.min(p.energy,p.maxEnergy);
}

function newRoom(code){
  const room={
    code,
    clients:new Map(),
    players:new Map(),
    projectiles:[],
    grenades:[],
    generators:JSON.parse(JSON.stringify(GENERATORS)),
    winningTeam:null,
    postVictoryTimer:0,
    frozen:false,
    tick:0
  };
  rooms.set(code,room);
  return room;
}

function send(ws,obj){
  if(ws.readyState===WebSocket.OPEN) ws.send(JSON.stringify(obj));
}

function getClientByPlayer(room,pid){
  for(const [ws,id] of room.clients) if(id===pid) return ws;
  return null;
}

function broadcast(room,obj){
  const s=JSON.stringify(obj);
  for(const ws of room.clients.keys()) if(ws.readyState===WebSocket.OPEN) ws.send(s);
}

function leaveRoom(ws){
  if(!ws.roomCode) return;
  const room=rooms.get(ws.roomCode);
  if(!room){ ws.roomCode=''; return; }
  const pid=room.clients.get(ws);
  room.clients.delete(ws);
  if(pid) room.players.delete(pid);
  broadcast(room,{type:'player_left',playerId:pid});
  if(room.clients.size===0) rooms.delete(room.code);
  ws.roomCode='';
}

function livingPlayers(room,team=null){
  return [...room.players.values()].filter(p=>p.alive && (!team||p.team===team));
}

function nearestVisibleEnemy(room,p){
  let best=null,bestD=Infinity;
  for(const q of room.players.values()){
    if(!q.alive || q.team===p.team) continue;
    if(lineBlocked(p.x,p.y,q.x,q.y)) continue;
    const d=dist(p.x,p.y,q.x,q.y);
    if(d<bestD){bestD=d;best=q;}
  }
  return best;
}

function applyDamage(target,raw,opts={}){
  if(!target.alive) return;
  const energyMult=opts.energyMult??1;
  const hpMult=opts.hpMult??1;
  const dr=target.maxEnergy>0?clamp(target.energy/target.maxEnergy,0,1):0;
  const blocked=raw*dr;
  const hpPart=raw-blocked;
  target.energy=Math.max(0,target.energy-blocked*energyMult);
  target.hp=Math.max(0,target.hp-hpPart*hpMult);
  target.lastHit=0;
  if(opts.regenSlowDuration) target.regenSlowTimer=Math.max(target.regenSlowTimer,opts.regenSlowDuration);
  if(opts.slowDuration) target.slowTimer=Math.max(target.slowTimer,opts.slowDuration);
  if(opts.zapRechargeExtra) target.zapExtra=Math.max(target.zapExtra,opts.zapRechargeExtra);
}

function killPlayer(room,p){
  if(!p.alive) return;
  p.alive=false;
  p.hp=0;
  p.deadTimer=4;
  p.vx=p.vy=0;
}

function respawnPlayer(room,p){
  const cls=CLASSES[p.classId];
  const teamPlayers=[...room.players.values()].filter(x=>x.team===p.team);
  const sp=spawnPoint(p.team,cls.r,Math.max(0,teamPlayers.indexOf(p)));
  p.x=sp.x;p.y=sp.y;p.vx=p.vy=0;
  p.hp=cls.maxHp;p.maxHp=cls.maxHp;
  p.energy=cls.maxEnergy;p.maxEnergy=cls.maxEnergy;
  p.r=cls.r;p.alive=true;p.deadTimer=0;p.lastHit=99;p.regenSlowTimer=0;p.slowTimer=0;p.zapExtra=0;
  p.cd.primary=p.cd.secondary=p.cd.utility=0;
  p.burst={kind:'',left:0,timer:0};
}

function damageGenerator(room,gen,raw,kind,x,y){
  if(gen.destroyed) return;
  let mult=kind==='knife'?.10:.25;
  if(isGeneratorWeakHit(gen,x,y,kind)) mult*=3;
  gen.hp=Math.max(0,gen.hp-raw*mult);
  if(gen.hp<=0 && !gen.destroyed){
    gen.destroyed=true;
    room.winningTeam=gen.team==='blue'?'red':'blue';
    room.postVictoryTimer=20;
  }
}

function fireProjectile(room,p,kind,angleOverride=null){
  const angle=angleOverride??p.angle;
  const w=WEAPONS[kind];
  if(!w) return;
  room.projectiles.push({
    id:`B${nextProjectileId++}`,
    owner:p.id,team:p.team,kind,
    x:p.x+Math.cos(angle)*(p.r+6), y:p.y+Math.sin(angle)*(p.r+6),
    vx:Math.cos(angle)*w.speed, vy:Math.sin(angle)*w.speed,
    life:w.life, r:w.r, damage:w.damage,
    energyMult:w.energyMult,hpMult:w.hpMult,
    regenSlowDuration:w.regenSlowDuration||0,
    slowDuration:w.slowDuration||0,
    zapRechargeExtra:w.zapRechargeExtra||0
  });
}

function tryFire(room,p){
  if(!p.alive || room.frozen) return;
  const input=p.input;
  p.cd.primary=Math.max(0,p.cd.primary-DT);
  p.cd.secondary=Math.max(0,p.cd.secondary-DT);
  p.cd.utility=Math.max(0,p.cd.utility-DT);
  p.burst.timer=Math.max(0,p.burst.timer-DT);

  const cls=p.classId;

  if(p.burst.left>0 && p.burst.timer<=0){
    const kind=p.burst.kind;
    const w=WEAPONS[kind];
    if(kind==='plasmaSMG' && p.energy<w.energyCost){
      p.burst.left=0;
    }else{
      if(kind==='plasmaSMG') p.energy-=w.energyCost;
      fireProjectile(room,p,kind,p.angle+(Math.random()-.5)*(kind==='plasmaSMG'?.056:.06));
      p.burst.left--;
      p.burst.timer=p.burst.left>0?w.burstGap:0;
      if(p.burst.left===0) p.cd.primary=w.cooldown;
    }
  }

  if(input.primary && p.cd.primary<=0 && p.burst.left===0){
    if(cls==='footman'){
      const w=WEAPONS.rifle;
      p.burst={kind:'rifle',left:w.burstCount,timer:0};
    }else if(cls==='heavy'){
      const w=WEAPONS.rifle;
      fireProjectile(room,p,'rifle');
      p.cd.primary=.28;
    }else if(cls==='assassin'){
      const w=WEAPONS.plasmaSMG;
      if(p.energy>=w.energyCost) p.burst={kind:'plasmaSMG',left:w.burstCount,timer:0};
    }else if(cls==='medic'){
      const w=WEAPONS.medicGun;
      p.burst={kind:'medicGun',left:w.burstCount,timer:0};
    }
  }

  if(input.secondary && p.cd.secondary<=0){
    if(cls==='footman'){
      const w=WEAPONS.blaster, cost=p.maxEnergy*w.energyCostPct;
      if(p.energy>=cost){
        p.energy-=cost; fireProjectile(room,p,'blaster'); p.cd.secondary=w.cooldown;
      }
    }else if(cls==='assassin'){
      const w=WEAPONS.knife;
      let hit=null,best=Infinity;
      for(const q of room.players.values()){
        if(!q.alive||q.team===p.team) continue;
        const d=dist(p.x,p.y,q.x,q.y);
        if(d<=w.range+q.r && !lineBlocked(p.x,p.y,q.x,q.y) && d<best){best=d;hit=q;}
      }
      if(hit){
        applyDamage(hit,w.damage,{energyMult:w.energyMult,hpMult:w.hpMult});
        if(hit.hp<=0) killPlayer(room,hit);
      }
      p.cd.secondary=w.cooldown;
    }else if(cls==='medic'){
      const w=WEAPONS.plasmaPistol;
      if(p.energy>=w.energyCost){
        p.energy-=w.energyCost; fireProjectile(room,p,'plasmaPistol'); p.cd.secondary=w.cooldown;
      }
    }else if(cls==='heavy'){
      const w=WEAPONS.blaster, cost=p.maxEnergy*.20;
      if(p.energy>=cost){p.energy-=cost;fireProjectile(room,p,'blaster');p.cd.secondary=1.3;}
    }
  }

  if(input.utility && p.cd.utility<=0){
    if(cls==='assassin'){
      const w=WEAPONS.zapper;
      if(p.energy>=w.energyCost){
        p.energy-=w.energyCost; fireProjectile(room,p,'zapper'); p.cd.utility=w.cooldown;
      }
    }else if(cls==='footman' || cls==='heavy'){
      room.grenades.push({
        id:`G${nextProjectileId++}`,owner:p.id,team:p.team,
        x:p.x+Math.cos(p.angle)*(p.r+6),y:p.y+Math.sin(p.angle)*(p.r+6),
        vx:Math.cos(p.angle)*WEAPONS.grenade.throwSpeed+p.vx,
        vy:Math.sin(p.angle)*WEAPONS.grenade.throwSpeed+p.vy,
        fuse:WEAPONS.grenade.fuse,r:5,embeddedGen:null
      });
      p.cd.utility=1.65;
    }else if(cls==='medic'){
      const cost=p.maxEnergy*.10;
      if(p.energy>=cost){
        p.energy-=cost;
        for(const q of room.players.values()){
          if(!q.alive||q.team!==p.team) continue;
          if(dist(p.x,p.y,q.x,q.y)<=100){
            const amount=lineBlocked(p.x,p.y,q.x,q.y)?15:30;
            q.hp=Math.min(q.maxHp,q.hp+amount);
          }
        }
        p.cd.utility=4;
      }
    }
  }
}

function updateBots(room){
  for(const p of room.players.values()){
    if(!p.isBot || !p.alive) continue;
    const target=nearestVisibleEnemy(room,p);
    if(target){
      const a=Math.atan2(target.y-p.y,target.x-p.x);
      p.input.aim=a;
      p.input.primary=dist(p.x,p.y,target.x,target.y)<420;
      const d=dist(p.x,p.y,target.x,target.y);
      if(d>230){p.input.mx=Math.cos(a);p.input.my=Math.sin(a);}
      else if(d<140){p.input.mx=-Math.cos(a);p.input.my=-Math.sin(a);}
      else{p.input.mx=-Math.sin(a)*.4;p.input.my=Math.cos(a)*.4;}
    }else{
      p.input.primary=false;
      const a=(room.tick*.02 + Number(p.id.replace(/\D/g,'')))%(Math.PI*2);
      p.input.mx=Math.cos(a)*.35;p.input.my=Math.sin(a)*.35;
      p.input.aim=a;
    }
  }
}

function updatePlayer(room,p){
  if(!p.alive){
    p.deadTimer-=DT;
    if(p.deadTimer<=0) respawnPlayer(room,p);
    return;
  }

  const cls=CLASSES[p.classId];
  p.lastHit+=DT;
  p.regenSlowTimer=Math.max(0,p.regenSlowTimer-DT);
  p.slowTimer=Math.max(0,p.slowTimer-DT);

  const rechargeWait=4+p.zapExtra;
  if(p.lastHit>=rechargeWait){
    p.zapExtra=0;
    if(!p.input.sprint && p.energy<p.maxEnergy){
      const mult=p.regenSlowTimer>0?.35:1;
      p.energy=Math.min(p.maxEnergy,p.energy+cls.regen*mult*DT);
    }
  }

  p.angle=p.input.aim;
  let mx=clamp(Number(p.input.mx)||0,-1,1), my=clamp(Number(p.input.my)||0,-1,1);
  const mag=Math.hypot(mx,my);
  if(mag>1){mx/=mag;my/=mag;}
  const status=p.slowTimer>0?.25:1;
  const sprint=p.input.sprint && p.energy>0 && mag>.05;
  const maxSpeed=cls.speed*status*(sprint?1.6:1);
  const accel=cls.accel*(sprint?1.35:1);

  if(mag>.05){
    p.vx+=mx*accel*DT;
    p.vy+=my*accel*DT;
  }else{
    const decay=Math.max(0,1-cls.drag*DT);
    p.vx*=decay;p.vy*=decay;
  }

  if(sprint){
    p.energy=Math.max(0,p.energy-p.maxEnergy*.08*DT);
  }

  const sp=Math.hypot(p.vx,p.vy);
  if(sp>maxSpeed){p.vx=p.vx/sp*maxSpeed;p.vy=p.vy/sp*maxSpeed;}
  moveWithWalls(p,p.vx*DT,p.vy*DT);

  tryFire(room,p);
}

function updateProjectiles(room){
  for(let i=room.projectiles.length-1;i>=0;i--){
    const b=room.projectiles[i];
    b.x+=b.vx*DT;b.y+=b.vy*DT;b.life-=DT;
    if(b.life<=0||b.x<0||b.y<0||b.x>WORLD.w||b.y>WORLD.h){
      room.projectiles.splice(i,1);continue;
    }
    if(hitsObstacle(b.x,b.y,b.r)){room.projectiles.splice(i,1);continue;}

    const enemyGen=room.generators.find(g=>g.team!==b.team);
    if(enemyGen && !enemyGen.destroyed && circleHitsGenerator(b.x,b.y,b.r,enemyGen)){
      damageGenerator(room,enemyGen,b.damage,b.kind,b.x,b.y);
      room.projectiles.splice(i,1);continue;
    }

    let hit=false;
    for(const p of room.players.values()){
      if(!p.alive||p.team===b.team||p.id===b.owner) continue;
      if(dist(b.x,b.y,p.x,p.y)<b.r+p.r){
        applyDamage(p,b.damage,{
          energyMult:b.energyMult,hpMult:b.hpMult,
          regenSlowDuration:b.regenSlowDuration,
          slowDuration:b.slowDuration,
          zapRechargeExtra:b.zapRechargeExtra
        });
        if(p.hp<=0) killPlayer(room,p);
        hit=true;break;
      }
    }
    if(hit) room.projectiles.splice(i,1);
  }
}

function updateGrenades(room){
  const gw=WEAPONS.grenade;
  for(let i=room.grenades.length-1;i>=0;i--){
    const g=room.grenades[i];
    g.fuse-=DT;

    if(!g.embeddedGen){
      const enemyGen=room.generators.find(gen=>gen.team!==g.team);
      const nx=g.x+g.vx*DT, ny=g.y+g.vy*DT;

      if(enemyGen && !enemyGen.destroyed){
        const panel=enemyGen.backDoor;
        const inward=panel.side==='west'?g.vx>0:g.vx<0;
        if(inward){
          const px=clamp(nx,panel.x,panel.x+panel.w), py=clamp(ny,panel.y,panel.y+panel.h);
          if((nx-px)*(nx-px)+(ny-py)*(ny-py)<=g.r*g.r){
            g.embeddedGen=enemyGen.id;
            g.x=panel.side==='west'?enemyGen.x+g.r+4:enemyGen.x+enemyGen.w-g.r-4;
            g.y=clamp(ny,enemyGen.y+8,enemyGen.y+enemyGen.h-8);
            g.vx=g.vy=0;
          }
        }
      }

      if(!g.embeddedGen){
        const ox=g.x,oy=g.y;
        g.x=nx;
        if(hitsObstacle(g.x,g.y,g.r)){g.x=ox;g.vx*=-.62;}
        g.y=ny;
        if(hitsObstacle(g.x,g.y,g.r)){g.y=oy;g.vy*=-.62;}
        g.vx*=Math.max(0,1-.95*DT);g.vy*=Math.max(0,1-.95*DT);
      }
    }

    if(g.fuse<=0){
      const gen=room.generators.find(x=>x.team!==g.team);
      if(gen && !gen.destroyed){
        if(g.embeddedGen===gen.id){
          damageGenerator(room,gen,gw.centerDamage,'grenade',g.x,g.y);
        }else{
          const d=Math.max(0,dist(g.x,g.y,gen.x+gen.w/2,gen.y+gen.h/2)-Math.max(gen.w,gen.h)/2);
          if(d<=gw.radius && !lineBlocked(g.x,g.y,gen.x+gen.w/2,gen.y+gen.h/2)){
            const t=clamp(d/gw.radius,0,1);
            const dmg=gw.centerDamage+(gw.edgeDamage-gw.centerDamage)*t;
            damageGenerator(room,gen,dmg,'grenade',g.x,g.y);
          }
        }
      }

      for(const p of room.players.values()){
        if(!p.alive||p.team===g.team) continue;
        const d=Math.max(0,dist(g.x,g.y,p.x,p.y)-p.r);
        if(d<=gw.radius && !lineBlocked(g.x,g.y,p.x,p.y)){
          const t=clamp(d/gw.radius,0,1);
          const dmg=gw.centerDamage+(gw.edgeDamage-gw.centerDamage)*t;
          applyDamage(p,dmg,{energyMult:gw.energyMult,hpMult:gw.hpMult});
          if(p.hp<=0) killPlayer(room,p);
        }
      }
      room.grenades.splice(i,1);
    }
  }
}

function returnToBases(room){
  let bi=0,ri=0;
  for(const p of room.players.values()){
    const idx=p.team==='blue'?bi++:ri++;
    if(!p.alive) respawnPlayer(room,p);
    const sp=spawnPoint(p.team,p.r,idx);
    p.x=sp.x;p.y=sp.y;p.vx=p.vy=0;
  }
  room.projectiles.length=0;room.grenades.length=0;
  room.frozen=true;room.postVictoryTimer=0;
}

function snapshotFor(room,viewer){
  const players=[];
  for(const p of room.players.values()){
    const visible = p.team===viewer.team || !p.alive || !lineBlocked(viewer.x,viewer.y,p.x,p.y);
    if(visible || p.id===viewer.id){
      players.push({
        id:p.id,team:p.team,isBot:p.isBot,classId:p.classId,
        x:p.x,y:p.y,angle:p.angle,r:p.r,
        hp:p.hp,maxHp:p.maxHp,energy:p.energy,maxEnergy:p.maxEnergy,
        alive:p.alive,deadTimer:p.deadTimer
      });
    }
  }

  return {
    type:'snapshot',
    tick:room.tick,
    yourId:viewer.id,
    winningTeam:room.winningTeam,
    postVictoryTimer:room.postVictoryTimer,
    frozen:room.frozen,
    generators:room.generators.map(g=>({id:g.id,team:g.team,x:g.x,y:g.y,w:g.w,h:g.h,hp:g.hp,maxHp:g.maxHp,destroyed:g.destroyed,backDoor:g.backDoor})),
    players,
    projectiles:room.projectiles.map(b=>({id:b.id,team:b.team,kind:b.kind,x:b.x,y:b.y,r:b.r})),
    grenades:room.grenades.map(g=>({id:g.id,team:g.team,x:g.x,y:g.y,r:g.r,fuse:g.fuse}))
  };
}

function tickRoom(room){
  if(room.frozen) return;
  room.tick++;
  updateBots(room);
  for(const p of room.players.values()) updatePlayer(room,p);
  updateProjectiles(room);
  updateGrenades(room);

  if(room.winningTeam && room.postVictoryTimer>0){
    room.postVictoryTimer=Math.max(0,room.postVictoryTimer-DT);
    if(room.postVictoryTimer<=0) returnToBases(room);
  }

  if(room.tick%2===0){
    for(const [ws,pid] of room.clients){
      const p=room.players.get(pid);
      if(p) send(ws,snapshotFor(room,p));
    }
  }
}

setInterval(()=>{
  for(const room of rooms.values()) tickRoom(room);
}, 1000/TICK_RATE);

const server=http.createServer((req,res)=>{
  let reqPath=req.url.split('?')[0];
  if(reqPath==='/') reqPath='/index.html';
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
  ws.playerId=`P${nextPlayerId++}`;ws.roomCode='';

  ws.on('message',raw=>{
    let msg;try{msg=JSON.parse(raw.toString());}catch{return;}

    if(msg.type==='create_room'){
      leaveRoom(ws);
      const code=makeCode(),room=newRoom(code);
      const p=makePlayer(ws.playerId,'blue',0,false);
      room.players.set(p.id,p);room.clients.set(ws,p.id);
      // two bots so combat is immediately testable
      room.players.set('B1',makePlayer('B1','blue',1,true));
      room.players.set('R1',makePlayer('R1','red',1,true));
      ws.roomCode=code;
      send(ws,{type:'room_created',roomCode:code,playerId:p.id,team:'blue'});
      return;
    }

    if(msg.type==='join_room'){
      const code=String(msg.roomCode||'').trim().toUpperCase();
      const room=rooms.get(code);
      if(!room){send(ws,{type:'error',message:'Room not found.'});return;}
      if(room.clients.size>=2){send(ws,{type:'error',message:'Room full (2 humans).'});return;}
      leaveRoom(ws);
      const p=makePlayer(ws.playerId,'red',0,false);
      room.players.set(p.id,p);room.clients.set(ws,p.id);
      ws.roomCode=code;
      send(ws,{type:'room_joined',roomCode:code,playerId:p.id,team:'red'});
      return;
    }

    if(!ws.roomCode) return;
    const room=rooms.get(ws.roomCode);if(!room) return;
    const pid=room.clients.get(ws),p=room.players.get(pid);if(!p) return;

    if(msg.type==='input'){
      p.input.mx=clamp(Number(msg.mx)||0,-1,1);
      p.input.my=clamp(Number(msg.my)||0,-1,1);
      p.input.aim=Number.isFinite(Number(msg.aim))?Number(msg.aim):p.input.aim;
      p.input.primary=!!msg.primary;
      p.input.secondary=!!msg.secondary;
      p.input.utility=!!msg.utility;
      p.input.sprint=!!msg.sprint;
      return;
    }

    if(msg.type==='class'){
      if(msg.classId in CLASSES && p.alive){
        applyClass(p,msg.classId);
        p.hp=p.maxHp;p.energy=p.maxEnergy;
      }
      return;
    }
  });

  ws.on('close',()=>leaveRoom(ws));
});

server.listen(PORT,()=>console.log(`Authoritative Infantry server on ${PORT}`));
