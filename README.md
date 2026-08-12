# Infantry v100 Multiplayer — Rebuilt

This rebuild keeps the v100 browser client responsive while the Node server remains authoritative.

## What changed from the previous multiplayer build

- Server snapshots are now sent at 30 Hz instead of 15 Hz.
- Your own movement is predicted locally at the browser frame rate.
- Small differences are reconciled gently to the authoritative server position.
- Large disagreements snap back to the server.
- v100's original weapon functions run locally for immediate:
  - sounds
  - cooldown feedback
  - charge feedback
  - knife animation
  - muzzle/projectile presentation
- The server broadcasts discrete game events for remote/bot audio:
  - weapon fire
  - cannon charging
  - grenade throws/explosions
  - cannon explosions
  - hits
  - healing
  - Repulsor
  - radar
  - deaths
  - generator destruction
- The server still decides actual movement, hits, HP/Energy, generators, deaths, respawns, AI, and victory.

## Room setup

- Create Room gives a four-character code.
- Second human enters that code and joins.
- Creator begins Blue; joiner begins Red.
- Each side also has a server-controlled support Footman.

## Controls

- W/S forward/back relative to aim
- A/D strafe
- LMB primary
- RMB secondary
- MMB utility
- Shift sprint
- Q secondary weapon swap
- R Repulsor
- T debug radar
- P switch team

## Local test

1. Install Node.js 20+
2. In this folder:
   npm install
   npm start
3. Open http://localhost:3000 in two browser windows.
4. Create a room in one and join it in the other.

## Render

Replace the files in your GitHub repository with this folder's contents, commit,
then on Render choose:

Manual Deploy -> Deploy latest commit

Build command:
npm install

Start command:
npm start


## Player names / visibility UI

- The class picker includes a player-name field.
- Human teammates display that chosen name.
- Enemy humans display only their chosen name.
- Enemy bots display only `ENEMY`.
- Enemy HP, Energy, bounty, class text, and bars are hidden from opponents.
