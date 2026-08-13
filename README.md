# Infantry v185 — Authoritative 4v4 Multiplayer

This build keeps every room at **4 Blue vs 4 Red**. Humans replace bot slots as they join; a bot immediately refills a slot when a human disconnects.

## Run locally

Requires Node.js 20+.

```bash
npm install
npm start
```

Then open `http://localhost:3000`. One player creates a room and shares the four-character room code.

## 4v4 networking

- Exactly **4 Blue + 4 Red slots** at all times.
- Up to **8 humans**; server bots fill the remaining slots.
- Server-authoritative movement, projectiles, damage, Energy, abilities, CTF, generators, deaths and respawns.
- Clients send input at 30 Hz, locally predict movement, and gently reconcile to 30 Hz snapshots.

## v185 gameplay changes

- Plasma SMG projectile speed: **210 → 168** (-20%).
- Bots on **both teams** now use forward exploration waypoints plus local wall avoidance / anti-stuck steering instead of repeatedly pushing into blocked direct routes.
- Flamethrower Energy cost doubled: **2 → 4 per 0.10s burst** (40 Energy/sec gross while continuously firing).
- Flamethrower damage now favors depleted targets: at **0% Energy, raw flame damage is 1.35×**; at **100% Energy, 0.65×**, interpolating between those values. Existing continuous-exposure stacking remains.
- Assassin base movement speed reduced **15%: 50 → 42.5**.
- All living player/bot models use **team colors**; class identity comes from silhouette/armor shape.
- For every visible player/bot, **HP is the top bar and Energy is the bottom bar**.
- Projectile visual/collision size order: **pistols < Plasma SMG < Light Carbine < Physical Rifle**. Carbine rounds are rendered as compact bullet-shaped slugs rather than circular pellets.
- Sergeant **T menu** now includes summonable friendly players. Summoning a normal friendly costs 50 Energy; summoning a flag carrier costs **150 Energy**.
- Enemy deaths play a short **splat** sound for the opposing team.
- Dead bodies are gray and do not retain Zapper/Fortify/utility visual indicators.
- Heal Pulse is **press-to-start**; it does not need to be held. A distinct initiation sound plays at charge start. Heal Energy cost doubled from 10% to **20% of max Energy**.
- Repulsor has **2 uses**. The first use retains the short 2.8s reuse delay; after the second use it enters a **30s recharge**, then restores both uses.

## CTF / flag-carrier rules

- A flag carrier **cannot Cloak**; picking up a flag also cancels an active Cloak.
- Sprinting while carrying a flag costs **35% more Energy**.
- Teleporting out while carrying a flag costs **225 Energy** (50% over the normal 150).
- A Sergeant summoning a teammate who is carrying a flag pays **150 Energy**.
- Starting a class change while carrying a flag **drops the flag immediately**.
- Bringing the enemy flag to your own generator scores **1 flag point** and returns that enemy flag to its home base.
- **First team to 3 flag points wins the round.** Generator destruction remains a win condition as well.

## Other retained gameplay

- Current Footman / Heavy / Medic / Sergeant stats and current weapon balance.
- Physical projectiles use the global 20% slower velocity rule.
- Heavy Q cycle: Machine Gun → Energy Cannon → Flamethrower.
- Flamethrower retains 0.5s charge-up, short range, 50% movement penalty, 50% rotation penalty, and continuous-hit damage stacking that resets after 1s out of flame.
- Energy Cannon gets two ricochets and explodes on the third wall contact or other termination.
- Sergeant Jammer/Sensors retain their 5s reactivation delays; enemy utility fields remain hidden.
- Y debug radar lasts 5 seconds and reveals enemy HP/Energy bars to that player.
- Bot weapon cooldowns/burst state are authoritative and cannot bypass cooldown by repeatedly restarting a burst.

## Controls

- **W/S** forward/back relative to aim
- **A/D** strafe
- **Mouse** aim
- **LMB / RMB / MMB** weapon slots
- **Shift** sprint
- **Q** swap/cycle class weapon utility
- **R** class ability
- **T** teleport / Sergeant summon / class-change menu
- **Y** debug radar
- **P** debug team switch (only when a bot slot is available on the other team)

## Render deployment

Use the included `render.yaml`, or configure:

- Build command: `npm install`
- Start command: `npm start`


## v186 Repulsor refresh
The first Repulsor use starts a 30-second pool refresh timer. If the second charge remains unused when the timer expires, the pool returns to two charges immediately. If the second charge is spent, a fresh 30-second exhausted cooldown starts from that second use.


## v187 movement and cannon LOS
- Left/right strafing is reduced by 30% (70% of previous lateral movement), with matching server authority and client prediction.
- Energy Cannon explosion damage is LOS-only. Walls block explosion damage to players and generators.
