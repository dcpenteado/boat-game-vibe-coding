import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import * as C from './shared/constants.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const app = express();
const http = createServer(app);
const io = new Server(http);

app.use(express.static(join(__dirname, 'public')));
app.use('/shared', express.static(join(__dirname, 'shared')));

// ============================================================
//  ROOMS
// ============================================================
const rooms = new Map();

function createRoom(name) {
  const room = {
    name,
    players: new Map(),
    projectiles: [],
    mines: [],
    islands: [],
    powerups: [],
    tickCount: 0,
    nextProjId: 1,
    nextMineId: 1,
    nextPowerupId: 1,
    lastPowerupSpawn: 0,
    loopInterval: null,
    kingId: null
  };
  generateIslands(room);
  room.loopInterval = setInterval(() => serverTick(room), C.TICK_INTERVAL);
  rooms.set(name, room);
  console.log(`[ROOM] Created: "${name}" (islands: ${room.islands.length})`);
  return room;
}

function destroyRoom(name) {
  const room = rooms.get(name);
  if (!room) return;
  clearInterval(room.loopInterval);
  rooms.delete(name);
  console.log(`[ROOM] Destroyed: "${name}"`);
}

// ============================================================
//  WEEKLY RANKING
// ============================================================
const RANKING_DIR = join(__dirname, 'data');
const RANKING_FILE = join(RANKING_DIR, 'ranking.json');
const MAX_RANKING_ENTRIES = 10;

function getWeekStart() {
  const now = new Date();
  const day = now.getUTCDay() || 7; // Monday = 1
  const monday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - day + 1));
  return monday.toISOString();
}

function loadRanking() {
  if (!existsSync(RANKING_DIR)) mkdirSync(RANKING_DIR, { recursive: true });

  if (!existsSync(RANKING_FILE)) {
    return { weekStart: getWeekStart(), entries: [] };
  }

  try {
    const data = JSON.parse(readFileSync(RANKING_FILE, 'utf-8'));
    if (data.weekStart !== getWeekStart()) {
      console.log('[RANKING] New week detected, resetting ranking.');
      return { weekStart: getWeekStart(), entries: [] };
    }
    return data;
  } catch {
    return { weekStart: getWeekStart(), entries: [] };
  }
}

function saveRanking(ranking) {
  if (!existsSync(RANKING_DIR)) mkdirSync(RANKING_DIR, { recursive: true });
  writeFileSync(RANKING_FILE, JSON.stringify(ranking, null, 2), 'utf-8');
}

let ranking = loadRanking();

function updateRanking(playerName, kills) {
  if (kills <= 0) return false;

  // Check for weekly reset
  if (ranking.weekStart !== getWeekStart()) {
    ranking = { weekStart: getWeekStart(), entries: [] };
  }

  const existing = ranking.entries.find(e => e.name === playerName);

  if (existing) {
    if (kills <= existing.kills) return false;
    existing.kills = kills;
    existing.date = new Date().toISOString();
  } else {
    ranking.entries.push({
      name: playerName,
      kills,
      date: new Date().toISOString()
    });
  }

  // Sort descending by kills, keep top entries
  ranking.entries.sort((a, b) => b.kills - a.kills);
  ranking.entries = ranking.entries.slice(0, MAX_RANKING_ENTRIES);

  saveRanking(ranking);
  return true;
}

function getRoomList() {
  const list = [];
  for (const [name, room] of rooms) {
    if (room.players.size > 0) {
      list.push({
        name,
        players: room.players.size,
        maxPlayers: C.MAX_PLAYERS
      });
    }
  }
  return list;
}

// ============================================================
//  ISLAND GENERATION
// ============================================================
function generateIslands(room) {
  const count = 5 + Math.floor(Math.random() * 4);
  for (let i = 0; i < count; i++) {
    let x, z, radius, valid;
    do {
      x = (Math.random() - 0.5) * C.MAP_SIZE * 0.7;
      z = (Math.random() - 0.5) * C.MAP_SIZE * 0.7;
      radius = 30 + Math.random() * 60;
      valid = true;
      for (const isl of room.islands) {
        const dx = x - isl.x, dz = z - isl.z;
        if (Math.sqrt(dx * dx + dz * dz) < isl.radius + radius + 40) {
          valid = false;
          break;
        }
      }
    } while (!valid);
    room.islands.push({ x, z, radius });
  }
}

// ============================================================
//  HELPERS
// ============================================================
function getNextColorIndex(room) {
  const used = new Set();
  for (const p of room.players.values()) used.add(p.colorIndex);
  for (let i = 0; i < C.PLAYER_COLORS.length; i++) {
    if (!used.has(i)) return i;
  }
  return Math.floor(Math.random() * C.PLAYER_COLORS.length);
}

function spawnPosition(room) {
  let x, z;
  do {
    x = (Math.random() - 0.5) * C.MAP_SIZE * 0.6;
    z = (Math.random() - 0.5) * C.MAP_SIZE * 0.6;
  } while (room.islands.some(i => {
    const dx = x - i.x, dz = z - i.z;
    return Math.sqrt(dx * dx + dz * dz) < i.radius + 50;
  }));
  return { x, z };
}

function respawnPlayer(p, room) {
  p.alive = true;
  p.hp = C.MAX_HP;
  p.speed = 0;
  p.vx = 0;
  p.vz = 0;
  p.dashTimer = 0;
  p.dashCooldown = 0;
  p.buffs = { speed: 0, trishot: 0, shield: 0 };
  const pos = spawnPosition(room);
  p.x = pos.x;
  p.z = pos.z;
  p.angle = Math.random() * Math.PI * 2;
}

function killPlayer(victim, killerId, room) {
  victim.alive = false;
  victim.hp = 0;
  victim.respawnTimer = C.RESPAWN_TIME;
  victim.deaths++;
  let killerName = 'Ambiente';
  let isKingKill = false;

  if (killerId && room.players.has(killerId)) {
    const killer = room.players.get(killerId);
    killer.kills++;
    killer.score += 100;
    killerName = killer.name;

    // Bounty bonus for killing the king
    if (room.kingId === victim.id) {
      killer.score += C.BOUNTY_KILL_BONUS;
      isKingKill = true;
    }
  }
  io.to(room.name).emit('kill', {
    victimId: victim.id,
    victimName: victim.name,
    killerId,
    killerName,
    isKingKill
  });

  updateKing(room);
}

function updateKing(room) {
  let bestId = null;
  let bestKills = C.BOUNTY_MIN_KILLS - 1;

  for (const [id, p] of room.players) {
    if (p.kills > bestKills) {
      bestKills = p.kills;
      bestId = id;
    } else if (p.kills === bestKills && bestId !== null) {
      // Tie-breaking: keep current king
      if (id === room.kingId) bestId = id;
    }
  }

  const prevKing = room.kingId;
  room.kingId = bestId;

  if (prevKing !== bestId) {
    const newKingName = bestId ? room.players.get(bestId)?.name : null;
    io.to(room.name).emit('kingChange', {
      newKingId: bestId,
      newKingName,
      prevKingId: prevKing
    });
  }
}

// ============================================================
//  POWER-UP SPAWNING
// ============================================================
function spawnPowerup(room) {
  if (room.powerups.length >= C.POWERUP_MAX) return;
  const pos = spawnPosition(room);
  const type = C.POWERUP_TYPES[Math.floor(Math.random() * C.POWERUP_TYPES.length)];
  const pu = { id: room.nextPowerupId++, x: pos.x, z: pos.z, type };
  room.powerups.push(pu);
  io.to(room.name).emit('powerupSpawn', pu);
}

// ============================================================
//  SERVER GAME LOOP (per room)
// ============================================================
function serverTick(room) {
  const dt = C.TICK_INTERVAL / 1000;
  const now = room.tickCount * dt;
  room.tickCount++;

  // --- Spawn power-ups ---
  if (now - room.lastPowerupSpawn >= C.POWERUP_SPAWN_INTERVAL && room.players.size > 0) {
    room.lastPowerupSpawn = now;
    spawnPowerup(room);
  }

  // --- Process each player ---
  for (const [id, p] of room.players) {
    if (!p.alive) {
      p.respawnTimer -= dt;
      if (p.respawnTimer <= 0) respawnPlayer(p, room);
      continue;
    }

    // Tick down buffs
    for (const b of ['speed', 'trishot', 'shield']) {
      if (p.buffs[b] > 0) p.buffs[b] -= dt;
    }

    // Dash timer
    if (p.dashTimer > 0) p.dashTimer -= dt;
    if (p.dashCooldown > 0) p.dashCooldown -= dt;

    // Start dash
    if (p.input.dash && p.dashCooldown <= 0 && p.dashTimer <= 0 && Math.abs(p.speed) > 5) {
      p.dashTimer = C.DASH_DURATION;
      p.dashCooldown = C.DASH_COOLDOWN;
      io.to(room.name).emit('dash', { playerId: id, x: p.x, z: p.z, angle: p.angle });
    }

    // Turning
    const speedFrac = Math.min(1, Math.abs(p.speed) / C.BOAT_MAX_SPEED);
    const turnRate = C.BOAT_ANGULAR_SPEED *
      (C.BOAT_MIN_TURN_FRAC + (1 - C.BOAT_MIN_TURN_FRAC) * speedFrac);

    if (p.input.left) p.angle += turnRate * dt;
    if (p.input.right) p.angle -= turnRate * dt;

    // Acceleration
    const accelMult = p.buffs.speed > 0 ? 1.6 : 1;
    const maxSpd = C.BOAT_MAX_SPEED * (p.buffs.speed > 0 ? 1.5 : 1);

    if (p.input.forward) {
      p.speed += C.BOAT_ACCELERATION * accelMult * dt;
    } else if (p.input.backward) {
      p.speed -= C.BOAT_REVERSE_ACCEL * dt;
    }

    // Dash boost
    if (p.dashTimer > 0) {
      p.speed = C.DASH_SPEED_BOOST;
    }

    // Clamp speed (skip during dash)
    if (p.dashTimer <= 0) {
      p.speed = Math.max(-maxSpd * 0.3, Math.min(maxSpd, p.speed));
    }

    // Water drag
    if (p.dashTimer <= 0) {
      p.speed *= Math.pow(C.BOAT_DRAG, dt * C.TICK_RATE);
      if (Math.abs(p.speed) < 0.5) p.speed = 0;
    }

    // Velocity from speed + angle
    p.vx = Math.sin(p.angle) * p.speed;
    p.vz = Math.cos(p.angle) * p.speed;

    // Move
    p.x += p.vx * dt;
    p.z += p.vz * dt;

    // Map bounds
    const margin = C.MAP_HALF - 20;
    if (p.x < -margin) { p.x = -margin; p.speed *= -0.5; }
    if (p.x > margin) { p.x = margin; p.speed *= -0.5; }
    if (p.z < -margin) { p.z = -margin; p.speed *= -0.5; }
    if (p.z > margin) { p.z = margin; p.speed *= -0.5; }

    // Island collision
    for (const isl of room.islands) {
      const dx = p.x - isl.x, dz = p.z - isl.z;
      const dist = Math.sqrt(dx * dx + dz * dz);
      const minDist = isl.radius + C.BOAT_LENGTH / 2;
      if (dist < minDist && dist > 0) {
        const nx = dx / dist, nz = dz / dist;
        p.x = isl.x + nx * minDist;
        p.z = isl.z + nz * minDist;
        p.speed *= -0.3;
        p.hp -= 5;
        if (p.hp <= 0) killPlayer(p, null, room);
      }
    }

    // Power-up pickup
    for (let i = room.powerups.length - 1; i >= 0; i--) {
      const pu = room.powerups[i];
      const dx = p.x - pu.x, dz = p.z - pu.z;
      if (dx * dx + dz * dz < (C.POWERUP_RADIUS + C.BOAT_WIDTH) ** 2) {
        if (pu.type === 'health') {
          p.hp = Math.min(C.MAX_HP, p.hp + 40);
        } else {
          p.buffs[pu.type] = C.POWERUP_DURATION[pu.type];
        }
        io.to(room.name).emit('powerupPickup', { id: pu.id, playerId: id, type: pu.type });
        room.powerups.splice(i, 1);
      }
    }

    // Charge tracking
    if (p.input.shoot && !p.wasShooting) {
      p.chargeStart = now;
    }

    // Fire on release (or at max charge)
    const charging = p.input.shoot && p.alive;
    const justReleased = p.wasShooting && !p.input.shoot;
    const chargeElapsed = (charging || justReleased) ? (now - p.chargeStart) : 0;
    const chargeFrac = Math.min(1, chargeElapsed / C.FIRE_CHARGE_TIME);
    const shouldFire = p.wasShooting && !p.input.shoot && p.alive && (now - p.lastFireTime) >= C.FIRE_COOLDOWN;

    if (shouldFire) {
      p.lastFireTime = now;
      const power = Math.max(0, Math.min(1, p.input.chargeFraction || chargeFrac));
      const speed = C.FIRE_MIN_SPEED + power * (C.FIRE_MAX_SPEED - C.FIRE_MIN_SPEED);
      const cosA = Math.cos(C.PROJECTILE_LAUNCH_ANGLE);
      const sinA = Math.sin(C.PROJECTILE_LAUNCH_ANGLE);
      const hSpeed = speed * cosA;
      const vy0 = speed * sinA;

      const angles = p.buffs.trishot > 0
        ? [p.angle - 0.15, p.angle, p.angle + 0.15]
        : [p.angle];

      for (const a of angles) {
        const frontX = p.x + Math.sin(a) * C.BOAT_LENGTH * 0.6;
        const frontZ = p.z + Math.cos(a) * C.BOAT_LENGTH * 0.6;
        room.projectiles.push({
          id: room.nextProjId++,
          ownerId: id,
          x: frontX, z: frontZ, y: 3,
          vx: Math.sin(a) * hSpeed,
          vz: Math.cos(a) * hSpeed,
          vy: vy0
        });
      }
      io.to(room.name).emit('fire', {
        playerId: id,
        x: p.x + Math.sin(p.angle) * C.BOAT_LENGTH * 0.6,
        z: p.z + Math.cos(p.angle) * C.BOAT_LENGTH * 0.6,
        angle: p.angle,
        power,
        trishot: p.buffs.trishot > 0
      });
    }
    p.wasShooting = p.input.shoot;

    // Mine dropping
    if (p.input.mine && !p.wasMining && p.alive && (now - p.lastMineTime) >= C.MINE_COOLDOWN) {
      p.lastMineTime = now;
      const mineX = p.x - Math.sin(p.angle) * C.BOAT_LENGTH * 2;
      const mineZ = p.z - Math.cos(p.angle) * C.BOAT_LENGTH * 2;
      room.mines.push({
        id: room.nextMineId++,
        ownerId: id,
        x: mineX,
        z: mineZ,
        spawnTime: now
      });
      io.to(room.name).emit('mineDrop', { playerId: id, x: mineX, z: mineZ });
    }
    p.wasMining = p.input.mine;
  }

  // --- Boat-to-boat ramming collision ---
  {
    const playerArray = [...room.players.entries()].filter(([, p]) => p.alive);
    for (let i = 0; i < playerArray.length; i++) {
      for (let j = i + 1; j < playerArray.length; j++) {
        const [idA, pA] = playerArray[i];
        const [idB, pB] = playerArray[j];

        const dx = pB.x - pA.x;
        const dz = pB.z - pA.z;
        const dist = Math.sqrt(dx * dx + dz * dz);
        const minDist = C.RAM_COLLISION_RADIUS * 2;

        if (dist >= minDist || dist < 0.01) continue;

        // Check cooldown for this pair
        const pairCooldown = pA.lastRamTime[idB] || 0;
        if (now - pairCooldown < C.RAM_COOLDOWN) {
          // Still push apart even on cooldown
          const overlap = minDist - dist;
          const nx = dx / dist, nz = dz / dist;
          pA.x -= nx * overlap * 0.5;
          pA.z -= nz * overlap * 0.5;
          pB.x += nx * overlap * 0.5;
          pB.z += nz * overlap * 0.5;
          continue;
        }

        // Direction unit vector from A to B
        const nx = dx / dist, nz = dz / dist;

        // Relative approach velocity (positive = approaching)
        const dvx = pA.vx - pB.vx;
        const dvz = pA.vz - pB.vz;
        const relativeApproachSpeed = dvx * nx + dvz * nz;

        // Push apart regardless of speed
        const overlap = minDist - dist;
        pA.x -= nx * (overlap * 0.5 + 1);
        pA.z -= nz * (overlap * 0.5 + 1);
        pB.x += nx * (overlap * 0.5 + 1);
        pB.z += nz * (overlap * 0.5 + 1);

        // Only deal damage if approaching fast enough
        if (relativeApproachSpeed < C.RAM_MIN_RELATIVE_SPEED) continue;

        // Calculate damage
        let baseDamage = Math.min(relativeApproachSpeed * C.RAM_DAMAGE_FACTOR, C.RAM_MAX_DAMAGE);

        // Dash multiplier
        const aDashing = pA.dashTimer > 0;
        const bDashing = pB.dashTimer > 0;
        if (aDashing || bDashing) baseDamage *= C.RAM_DASH_MULTIPLIER;

        // Distribute damage: faster boat takes less
        const speedA = Math.abs(pA.speed);
        const speedB = Math.abs(pB.speed);
        let damageToA, damageToB, rammerId;

        if (speedA >= speedB) {
          damageToA = Math.round(baseDamage * C.RAM_FASTER_DAMAGE_RATIO);
          damageToB = Math.round(baseDamage * C.RAM_SLOWER_DAMAGE_RATIO);
          rammerId = idA;
        } else {
          damageToA = Math.round(baseDamage * C.RAM_SLOWER_DAMAGE_RATIO);
          damageToB = Math.round(baseDamage * C.RAM_FASTER_DAMAGE_RATIO);
          rammerId = idB;
        }

        // Shield check A
        if (damageToA > 0 && pA.buffs.shield > 0) {
          pA.buffs.shield = 0;
          io.to(room.name).emit('shieldBreak', { playerId: idA, x: pA.x, z: pA.z });
          damageToA = 0;
        }
        // Shield check B
        if (damageToB > 0 && pB.buffs.shield > 0) {
          pB.buffs.shield = 0;
          io.to(room.name).emit('shieldBreak', { playerId: idB, x: pB.x, z: pB.z });
          damageToB = 0;
        }

        // Apply damage A
        if (damageToA > 0) {
          pA.hp -= damageToA;
          io.to(room.name).emit('hit', {
            x: (pA.x + pB.x) / 2, z: (pA.z + pB.z) / 2,
            targetId: idA, shooterId: idB, damage: damageToA
          });
          if (pA.hp <= 0) killPlayer(pA, idB, room);
        }
        // Apply damage B
        if (damageToB > 0 && pB.alive) {
          pB.hp -= damageToB;
          io.to(room.name).emit('hit', {
            x: (pA.x + pB.x) / 2, z: (pA.z + pB.z) / 2,
            targetId: idB, shooterId: idA, damage: damageToB
          });
          if (pB.hp <= 0) killPlayer(pB, idA, room);
        }

        // Ram event for VFX
        io.to(room.name).emit('ram', {
          x: (pA.x + pB.x) / 2, z: (pA.z + pB.z) / 2,
          playerA: idA, playerB: idB,
          intensity: Math.min(1, relativeApproachSpeed / 250)
        });

        // Knockback
        pA.speed = -Math.abs(pA.speed) * 0.3 - C.RAM_KNOCKBACK_FORCE * 0.3;
        pB.speed = -Math.abs(pB.speed) * 0.3 - C.RAM_KNOCKBACK_FORCE * 0.3;

        // Cancel dash on collision
        if (aDashing) pA.dashTimer = 0;
        if (bDashing) pB.dashTimer = 0;

        // Set cooldown
        pA.lastRamTime[idB] = now;
        pB.lastRamTime[idA] = now;
      }
    }
  }

  // --- Update projectiles (ballistic) ---
  for (let i = room.projectiles.length - 1; i >= 0; i--) {
    const proj = room.projectiles[i];
    proj.x += proj.vx * dt;
    proj.z += proj.vz * dt;
    proj.y += proj.vy * dt;
    proj.vy -= C.PROJECTILE_GRAVITY * dt;

    // Out of bounds
    if (Math.abs(proj.x) > C.MAP_HALF || Math.abs(proj.z) > C.MAP_HALF) {
      room.projectiles.splice(i, 1);
      continue;
    }

    // Hit players (during flight, if projectile is at boat height)
    let removed = false;
    if (proj.y < 15 && proj.y > -1) {
      for (const [pid, p] of room.players) {
        if (pid === proj.ownerId || !p.alive) continue;
        const dx = proj.x - p.x, dz = proj.z - p.z;
        const dist = Math.sqrt(dx * dx + dz * dz);
        let damage = 0;
        if (dist <= C.CANNONBALL_DIRECT_RADIUS) {
          damage = C.CANNONBALL_DIRECT_DAMAGE;
        } else if (dist <= C.CANNONBALL_SPLASH_RADIUS) {
          damage = C.CANNONBALL_SPLASH_DAMAGE;
        }
        if (damage > 0) {
          if (p.buffs.shield > 0) {
            p.buffs.shield = 0;
            io.to(room.name).emit('shieldBreak', { playerId: pid, x: proj.x, z: proj.z });
          } else {
            p.hp -= damage;
            io.to(room.name).emit('hit', { x: proj.x, z: proj.z, targetId: pid, shooterId: proj.ownerId, damage });
            if (p.hp <= 0) killPlayer(p, proj.ownerId, room);
          }
          room.projectiles.splice(i, 1);
          removed = true;
          break;
        }
      }
    }
    if (removed) continue;

    // Hit water (landed)
    if (proj.y <= 0) {
      io.to(room.name).emit('hit', { x: proj.x, z: proj.z, targetId: null, shooterId: proj.ownerId, damage: 0 });
      room.projectiles.splice(i, 1);
      continue;
    }

    // Hit islands (during flight at island height)
    if (proj.y < 12) {
      for (const isl of room.islands) {
        const dx = proj.x - isl.x, dz = proj.z - isl.z;
        if (dx * dx + dz * dz < (isl.radius + C.CANNONBALL_DIRECT_RADIUS) ** 2) {
          io.to(room.name).emit('hit', { x: proj.x, z: proj.z, targetId: null, shooterId: proj.ownerId, damage: 0 });
          room.projectiles.splice(i, 1);
          break;
        }
      }
    }
  }

  // --- Update mines ---
  for (let i = room.mines.length - 1; i >= 0; i--) {
    const mine = room.mines[i];

    // Expire after lifetime
    if (now - mine.spawnTime >= C.MINE_LIFETIME) {
      room.mines.splice(i, 1);
      continue;
    }

    // Check collision with players
    let detonated = false;
    for (const [pid, p] of room.players) {
      if (!p.alive) continue;
      const dx = mine.x - p.x, dz = mine.z - p.z;
      const dist = Math.sqrt(dx * dx + dz * dz);
      if (dist < C.MINE_RADIUS + C.BOAT_WIDTH) {
        if (p.buffs.shield > 0) {
          p.buffs.shield = 0;
          io.to(room.name).emit('shieldBreak', { playerId: pid, x: mine.x, z: mine.z });
        } else {
          p.hp -= C.MINE_DAMAGE;
          io.to(room.name).emit('mineExplode', { x: mine.x, z: mine.z, targetId: pid });
          if (p.hp <= 0) killPlayer(p, mine.ownerId === pid ? null : mine.ownerId, room);
        }
        room.mines.splice(i, 1);
        detonated = true;
        break;
      }
    }
    if (detonated) continue;
  }

  // --- Broadcast state ---
  const state = {
    tick: room.tickCount,
    kingId: room.kingId,
    players: [],
    projectiles: room.projectiles.map(p => ({ id: p.id, x: p.x, z: p.z, y: p.y })),
    mines: room.mines.map(m => ({ id: m.id, x: m.x, z: m.z })),
    powerups: room.powerups.map(p => ({ id: p.id, x: p.x, z: p.z, type: p.type }))
  };
  for (const [id, p] of room.players) {
    state.players.push({
      id, name: p.name, color: p.color,
      x: p.x, z: p.z, angle: p.angle,
      speed: p.speed, hp: p.hp, alive: p.alive,
      score: p.score, kills: p.kills, deaths: p.deaths,
      dashing: p.dashTimer > 0,
      dashCooldown: Math.max(0, p.dashCooldown),
      mineCooldown: Math.max(0, C.MINE_COOLDOWN - (now - p.lastMineTime)),
      buffs: {
        speed: p.buffs.speed > 0,
        trishot: p.buffs.trishot > 0,
        shield: p.buffs.shield > 0
      }
    });
  }
  io.to(room.name).emit('state', state);
}

// ============================================================
//  PLAYER REMOVAL FROM ROOM
// ============================================================
function removePlayerFromRoom(socket) {
  const roomName = socket._roomName;
  if (!roomName) return;

  const room = rooms.get(roomName);
  if (!room) return;

  const p = room.players.get(socket.id);
  // Update weekly ranking before removing player
  if (p && p.kills > 0) {
    if (updateRanking(p.name, p.kills)) {
      io.emit('ranking', ranking.entries);
    }
  }
  console.log(`[-] ${p ? p.name : socket.id} left room "${roomName}"`);
  const wasKing = room.kingId === socket.id;
  room.players.delete(socket.id);
  socket.leave(roomName);
  socket._roomName = null;

  if (wasKing) updateKing(room);

  io.to(roomName).emit('playerLeft', { id: socket.id });

  // Destroy room if empty
  if (room.players.size === 0) {
    destroyRoom(roomName);
    broadcastRoomList();
  } else {
    broadcastRoomList();
  }
}

function broadcastRoomList() {
  io.emit('roomList', getRoomList());
}

// ============================================================
//  SOCKET.IO CONNECTIONS
// ============================================================
io.on('connection', (socket) => {
  console.log(`[+] ${socket.id} connected`);

  // Send current room list and ranking on connect
  socket.emit('roomList', getRoomList());
  socket.emit('ranking', ranking.entries);

  // Create a new room
  socket.on('createRoom', (data, callback) => {
    const roomName = (data.roomName || '').trim().substring(0, 24);
    if (!roomName) {
      callback({ error: 'Invalid room name.' });
      return;
    }
    if (rooms.has(roomName)) {
      callback({ error: 'A room with that name already exists.' });
      return;
    }

    createRoom(roomName);
    broadcastRoomList();
    callback({ ok: true });
  });

  // Join a room
  socket.on('joinRoom', (data) => {
    const roomName = data.roomName;
    const room = rooms.get(roomName);

    if (!room) {
      socket.emit('roomError', 'Room not found.');
      return;
    }
    if (room.players.size >= C.MAX_PLAYERS) {
      socket.emit('roomError', 'Room is full!');
      return;
    }

    // Join Socket.IO room
    socket.join(roomName);
    socket._roomName = roomName;

    const colorIdx = getNextColorIndex(room);
    const player = {
      id: socket.id,
      name: (data.name || 'Sailor').substring(0, 12),
      color: C.PLAYER_COLORS[colorIdx],
      colorIndex: colorIdx,
      x: 0, z: 0, angle: 0,
      vx: 0, vz: 0, speed: 0,
      hp: C.MAX_HP, alive: true, respawnTimer: 0,
      score: 0, kills: 0, deaths: 0,
      input: { forward: false, backward: false, left: false, right: false, shoot: false, dash: false, mine: false, chargeFraction: 0 },
      lastFireTime: -C.FIRE_COOLDOWN,
      lastMineTime: -C.MINE_COOLDOWN,
      wasShooting: false,
      wasMining: false,
      chargeStart: 0,
      dashTimer: 0,
      dashCooldown: 0,
      buffs: { speed: 0, trishot: 0, shield: 0 },
      lastRamTime: {}
    };
    respawnPlayer(player, room);
    room.players.set(socket.id, player);

    socket.emit('welcome', {
      id: socket.id,
      roomName,
      islands: room.islands,
      mapSize: C.MAP_SIZE,
      powerups: room.powerups.map(p => ({ id: p.id, x: p.x, z: p.z, type: p.type }))
    });

    io.to(roomName).emit('playerJoined', { id: socket.id, name: player.name, color: player.color });
    broadcastRoomList();
    console.log(`[>] ${player.name} joined room "${roomName}"`);
  });

  socket.on('getRooms', () => {
    socket.emit('roomList', getRoomList());
  });

  socket.on('getRanking', () => {
    socket.emit('ranking', ranking.entries);
  });

  socket.on('input', (data) => {
    const roomName = socket._roomName;
    if (!roomName) return;
    const room = rooms.get(roomName);
    if (!room) return;
    const p = room.players.get(socket.id);
    if (p) {
      p.input.forward = !!data.forward;
      p.input.backward = !!data.backward;
      p.input.left = !!data.left;
      p.input.right = !!data.right;
      p.input.shoot = !!data.shoot;
      p.input.dash = !!data.dash;
      p.input.mine = !!data.mine;
      p.input.chargeFraction = typeof data.chargeFraction === 'number' ? data.chargeFraction : 0;
    }
  });

  socket.on('leaveRoom', () => {
    removePlayerFromRoom(socket);
  });

  socket.on('disconnect', () => {
    removePlayerFromRoom(socket);
    console.log(`[-] ${socket.id} disconnected`);
  });
});

// ============================================================
//  START
// ============================================================
const PORT = process.env.PORT || 3000;
http.listen(PORT, () => {
  console.log(`\n  BARQUINHO server running on http://localhost:${PORT}\n`);
  console.log(`  Tick rate: ${C.TICK_RATE} Hz\n`);
});
