# Infantry v183 — Authoritative 4v4 Multiplayer

This is the multiplayer branch rebuilt from the current v183 balance.

## 4v4 room behavior

- Every room has exactly **4 Blue slots + 4 Red slots**.
- Empty slots are controlled by server bots.
- A joining human **replaces a bot** on the team with fewer humans.
- When a human disconnects, a bot **immediately refills that exact slot**.
- Maximum: **8 human players** in one room.
- The server simulates movement, damage, Energy, projectiles, AI, generators, flags, deaths, respawns, class abilities and victory.
- Clients send input at 30 Hz, locally predict their own movement, and gently reconcile to 30 Hz authoritative snapshots.

## Current v183 gameplay carried into this branch

- Current Footman / Heavy / Assassin / Medic / Sergeant class stats.
- Physical projectiles use the current 20% slower global velocity rule.
- Physical Rifle current 3-shot burst spacing and cooldown behavior.
- Heavy LMB Q cycle: **Machine Gun → Energy Cannon → Flamethrower**.
- Flamethrower: 0.5s charge, Energy drain, 50% movement and rotation while active, stacking damage, current range/damage tuning.
- Energy Cannon: 2 ricochets, detonates on the third wall contact, and always detonates on termination.
- Current Blaster, Shotgun, Pistol, Plasma Pistol, Plasma SMG, Zapper and Light Carbine tuning.
- Energy projectiles get at least one ricochet; explicit larger counts are preserved.
- Grenades: 3/life and current player-contact speed reduction.
- Generators: 950 HP, weak-point behavior, and friendly projectiles cannot pass through their own generator.
- Center healing node and physical center tower.
- Capture-the-flag objectives.
- R abilities: Repulsor, Fortify, Cloak, Sergeant Summon.
- Sergeant Jammer / Sensors, 5s reactivation delay, and 306-unit Jammer radius.
- Enemy Jammer/Sensor fields are not shown to opponents.
- T menu: teleport to friendly Sergeant + full-Energy 3s class change.
- Y debug radar lasts 5 seconds and reveals enemy HP/Energy bars to that player.
- Shared team LOS, cloak, Sensor reveal, and Zapper shared-vision disruption.
- Bot weapon cooldown/burst handling is server-owned, preventing the unlimited-fire bug.

## Controls

- **W/S** forward/back relative to aim
- **A/D** strafe
- **Mouse** aim
- **LMB / RMB / MMB** weapon slots
- **Shift** sprint
- **Q** swap/cycle class weapon utility
- **R** class ability
- **T** Sergeant teleport / class-change menu
- **Y** debug radar
- **P** debug team switch; the server swaps you into an available bot slot so teams remain 4v4

## Local run

Requires Node.js 20+.

```bash
npm install
npm start
```

Then open `http://localhost:3000` in multiple browser windows/devices. One player creates a room and shares the four-character room code.

## Render deployment

Use the included `render.yaml`, or configure:

- Build command: `npm install`
- Start command: `npm start`
