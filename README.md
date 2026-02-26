# Boar War

A real-time multiplayer naval combat game built with Three.js and Socket.IO.

## Features

- **3D naval battles** — steer your boat, charge cannons, and sink opponents on a stylized ocean
- **Multiplayer rooms** — create or join rooms; up to 10 players per room
- **Power-ups** — collect health, speed boost, triple shot, and shield pickups scattered across the map
- **Dash mechanic** — short burst of speed on cooldown to dodge incoming fire
- **Charged shots** — hold to charge, release to fire; longer charge = faster cannonball
- **Live HUD** — health bar, charge bar, dash cooldown, minimap, scoreboard, and kill feed
- **Procedural islands** — each room generates unique island layouts with trees and rocks

## Tech Stack

- **Server:** Node.js, Express, Socket.IO
- **Client:** Three.js (3D rendering), vanilla JS (ES modules)
- **Networking:** Socket.IO with server-authoritative state at 20 tick/s and client-side interpolation

## Getting Started

### Prerequisites

- Node.js 18+

### Install & Run

```bash
npm install
npm start
```

The server starts on `http://localhost:3000` by default.

For development with auto-reload:

```bash
npm run dev
```

## Controls

| Key | Action |
|-----|--------|
| W / S | Forward / Reverse |
| A / D | Turn left / right |
| Space or Left Click | Hold to charge, release to fire |
| Shift | Dash (5s cooldown) |

## Project Structure

```
game/
├── server.js              # Game server (physics, rooms, networking)
├── shared/
│   └── constants.js       # Shared game constants (physics, combat, map)
├── public/
│   ├── index.html         # Entry point (lobby + game UI)
│   ├── css/
│   │   └── style.css      # Styling
│   └── js/
│       ├── game.js        # Main client (scene, camera, lobby, render loop)
│       ├── network.js     # Socket.IO client wrapper
│       ├── hud.js         # HUD rendering (health, minimap, scoreboard)
│       ├── input.js       # Keyboard/mouse input handling
│       ├── boat.js        # 3D boat model
│       ├── water.js       # Ocean surface
│       ├── effects.js     # Particle effects (explosions, wakes, splashes)
│       └── audio.js       # Sound effects & music
└── package.json
```
