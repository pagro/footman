# Infantry Authoritative Multiplayer v2

This build makes the Node.js server the source of truth for the match.

Server-owned systems:
- human and bot positions
- movement and collision
- class stats
- HP and Energy
- Energy regeneration and status timers
- primary / secondary / utility weapon inputs
- bullets and projectile collision
- rifle / carbine / plasma SMG bursts
- knife
- Zapper
- grenades
- Medic instant test heal pulse
- generator HP and weak-point grenade intake
- deaths and 4-second respawns
- generator victory
- 20-second post-victory period
- final return to bases
- bots

This is a clean authoritative multiplayer foundation rather than a 1:1 port of every v94 ability.
Some weapons are simplified for the first authoritative build:
- Heavy primary currently uses a simple physical rifle-like shot instead of the full spin-up MG.
- Heavy secondary uses an energy projectile instead of the full charged cannon.
- Medic heal is currently an instant server-side pulse instead of the full 2-second stationary wind-up.
- Repulsor and weapon swapping are not included yet.

## Local test

1. Install Node.js 20 or newer.
2. Open a terminal in this folder.
3. Run:

   npm install
   npm start

4. Open http://localhost:3000 in one browser.
5. Click Create Room.
6. Open a second browser or another computer on your LAN.
7. Enter the room code and click Join Room.

For another computer on the same LAN, use the host computer's LAN IP, for example:
http://192.168.1.50:3000

## Internet deployment

Deploy this entire folder as one Node.js web service.

Render:
- Build command: npm install
- Start command: npm start
- WebSockets are used on the same host/port as the webpage.

After deployment:
1. You open the Render URL and click Create Room.
2. Send your friend the same URL plus the 4-character room code.
3. She opens the URL, enters the code, and joins the same authoritative match.
