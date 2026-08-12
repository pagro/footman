# Infantry v100 Multiplayer

This version uses the v100 prototype as the actual game client rather than replacing it with the simplified multiplayer renderer.

## Preserved from v100
- current arena / bases / cover layout
- 1200 HP generators and inward weak point
- grenade weak-point intake
- current Footman / Heavy / Assassin / Medic stats
- class-specific Heavy armor, Medic helmet, Assassin sleek model
- team-colored player models
- current loadout HUD and cooldown UI
- current class selector
- Q weapon swaps
- R Repulsor
- T radar debug reveal
- P team-switch debug command
- shared team LOS with fade in/out
- support AI behavior that moves toward center then supports invasion
- 4-second respawns
- 20-second post-victory period

## Multiplayer
- 2 human players
- creator starts Blue
- joining player starts Red
- one server-controlled Footman support player per team
- room codes

## Server authority
The Node server owns movement, classes, HP, Energy, damage reduction, weapon cooldowns,
projectiles, grenades, status effects, healing, Repulsor, generators, deaths,
respawns, radar, LOS filtering, support AI, victory, and the post-victory timer.

## Local test
1. Install Node.js 20+
2. Open a terminal in this folder
3. Run:
   npm install
   npm start
4. Open http://localhost:3000 in two browser windows
5. Click Create Room in the first
6. Enter that room code in the second

## Render deployment
Upload all files in this folder to your GitHub repository.

Render Web Service settings:
- Build Command: npm install
- Start Command: npm start

Both players then open the same Render URL. One creates a room and sends the four-character code to the other.
