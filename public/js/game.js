import * as THREE from 'three';
import { createWater, updateWater } from './water.js';
import { BoatModel } from './boat.js';
import { EffectsManager } from './effects.js';
import { NetworkManager } from './network.js';
import { HUD } from './hud.js';
import { InputManager } from './input.js';
import { AudioManager } from './audio.js';

// ============================================================
//  CONSTANTS
// ============================================================
const TICK_INTERVAL = 50;
const POWERUP_COLORS = {
  health: 0x2ecc71,
  speed: 0xf39c12,
  trishot: 0xe74c3c,
  shield: 0x3498db
};

// ============================================================
//  THREE.JS SCENE
// ============================================================
const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0x1a3050, 0.00025);
scene.background = new THREE.Color(0x1a3050);

const camera = new THREE.PerspectiveCamera(
  55, window.innerWidth / window.innerHeight, 1, 6000
);
camera.position.set(0, 50, -80);

const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.5;
document.body.appendChild(renderer.domElement);

// ============================================================
//  LIGHTING
// ============================================================
scene.add(new THREE.AmbientLight(0x4488bb, 0.5));
const sunLight = new THREE.DirectionalLight(0xfff0dd, 1.8);
sunLight.position.set(300, 400, 200);
scene.add(sunLight);
scene.add(new THREE.HemisphereLight(0x88bbff, 0x224466, 0.3));

// ============================================================
//  WATER + SKY
// ============================================================
const waterObj = createWater(scene, renderer);

// ============================================================
//  MODULES
// ============================================================
const effects = new EffectsManager(scene);
const input = new InputManager();
const hud = new HUD();
const net = new NetworkManager();
const audio = new AudioManager();

// ============================================================
//  GAME STATE
// ============================================================
const boats = new Map();
const islandMeshes = [];
const powerupMeshes = new Map();
const boundaryWalls = [];
let islandData = [];
let myId = null;
let mapSize = 3000;

// Interpolation buffer
const stateBuffer = [];
const INTERP_DELAY = 150; // ms behind live (3 server ticks at 20Hz)
let serverTimeOffset = null;

// Screen shake
let shakeIntensity = 0;
let shakeDecay = 0;

// Hit direction indicator
const hitIndicators = [];

// Player name stored across lobby/game
let playerName = 'Sailor';

// ============================================================
//  SCREEN SHAKE
// ============================================================
function addShake(intensity) {
  shakeIntensity = Math.min(shakeIntensity + intensity, 2.5);
  shakeDecay = 8;
}

// ============================================================
//  POWER-UP 3D MESHES
// ============================================================
function createPowerupMesh(pu) {
  const group = new THREE.Group();
  const color = POWERUP_COLORS[pu.type] || 0xffffff;

  const geo = new THREE.OctahedronGeometry(4, 1);
  const mat = new THREE.MeshPhongMaterial({
    color, emissive: color, emissiveIntensity: 0.5,
    transparent: true, opacity: 0.85
  });
  group.add(new THREE.Mesh(geo, mat));

  const ringGeo = new THREE.TorusGeometry(6, 0.4, 8, 24);
  const ringMat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.4 });
  group.add(new THREE.Mesh(ringGeo, ringMat));

  const light = new THREE.PointLight(color, 1, 40);
  light.position.y = 3;
  group.add(light);

  group.position.set(pu.x, 5, pu.z);
  group._puId = pu.id;
  group._puType = pu.type;
  return group;
}

// ============================================================
//  NAME LABELS
// ============================================================
function createNameSprite(name, color) {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 64;
  const ctx = canvas.getContext('2d');

  ctx.font = 'bold 28px Outfit, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  ctx.fillStyle = 'rgba(0,0,0,0.6)';
  ctx.fillText(name, 129, 33);

  const hex = '#' + new THREE.Color(color).getHexString();
  ctx.fillStyle = hex;
  ctx.fillText(name, 128, 32);

  const texture = new THREE.CanvasTexture(canvas);
  const mat = new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false });
  const sprite = new THREE.Sprite(mat);
  sprite.scale.set(16, 4, 1);
  return sprite;
}

// ============================================================
//  ISLAND CREATION
// ============================================================
function createIslandMesh(isl) {
  const group = new THREE.Group();
  const r = isl.radius;

  const geo = new THREE.CylinderGeometry(r * 0.9, r * 1.05, 6, 24);
  const mat = new THREE.MeshPhongMaterial({ color: 0x3d7a3d, flatShading: true });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.y = 1;
  group.add(mesh);

  const beachGeo = new THREE.CylinderGeometry(r * 1.05, r * 1.15, 2, 24);
  group.add(new THREE.Mesh(beachGeo, new THREE.MeshLambertMaterial({ color: 0xc2b280 })));
  group.children[1].position.y = -1;

  for (let i = 0; i < 2 + Math.floor(Math.random() * 3); i++) {
    const a = Math.random() * Math.PI * 2;
    const d = r * (0.3 + Math.random() * 0.5);
    const rock = new THREE.Mesh(
      new THREE.DodecahedronGeometry(1.5 + Math.random() * 3, 0),
      new THREE.MeshLambertMaterial({ color: 0x556655, flatShading: true })
    );
    rock.position.set(Math.cos(a) * d, 3 + Math.random() * 2, Math.sin(a) * d);
    rock.rotation.set(Math.random(), Math.random(), Math.random());
    group.add(rock);
  }

  for (let i = 0; i < 1 + Math.floor(Math.random() * 3); i++) {
    const a = Math.random() * Math.PI * 2;
    const d = r * (0.1 + Math.random() * 0.4);
    const px = Math.cos(a) * d, pz = Math.sin(a) * d;

    const trunk = new THREE.Mesh(
      new THREE.CylinderGeometry(0.3, 0.5, 8 + Math.random() * 4, 6),
      new THREE.MeshLambertMaterial({ color: 0x8B6914 })
    );
    trunk.position.set(px, 8, pz);
    trunk.rotation.z = (Math.random() - 0.5) * 0.15;
    group.add(trunk);

    for (let j = 0; j < 5; j++) {
      const leaf = new THREE.Mesh(
        new THREE.ConeGeometry(3, 4, 4),
        new THREE.MeshLambertMaterial({ color: 0x228B22, flatShading: true })
      );
      const la = (j / 5) * Math.PI * 2;
      leaf.position.set(px + Math.cos(la) * 2, 12 + Math.random(), pz + Math.sin(la) * 2);
      leaf.rotation.x = (Math.random() - 0.5) * 0.5;
      leaf.rotation.z = (Math.random() - 0.5) * 0.5;
      group.add(leaf);
    }
  }

  group.position.set(isl.x, 0, isl.z);
  return group;
}

function createBoundaryMarkers() {
  const half = mapSize / 2;
  const markerMat = new THREE.MeshBasicMaterial({ color: 0xff3333, transparent: true, opacity: 0.15 });
  const wallGeo = new THREE.PlaneGeometry(mapSize, 40);
  for (const w of [
    { pos: [0, 20, -half], rot: [0, 0, 0] },
    { pos: [0, 20, half], rot: [0, Math.PI, 0] },
    { pos: [-half, 20, 0], rot: [0, Math.PI / 2, 0] },
    { pos: [half, 20, 0], rot: [0, -Math.PI / 2, 0] }
  ]) {
    const wall = new THREE.Mesh(wallGeo, markerMat);
    wall.position.set(...w.pos);
    wall.rotation.set(...w.rot);
    scene.add(wall);
    boundaryWalls.push(wall);
  }
}

// ============================================================
//  CLEANUP (for leaving a room)
// ============================================================
function cleanupGameState() {
  // Remove boats
  for (const [id, boat] of boats) {
    boat.dispose(scene);
    effects.clearWake(id);
  }
  boats.clear();

  // Remove islands
  for (const mesh of islandMeshes) {
    scene.remove(mesh);
  }
  islandMeshes.length = 0;
  islandData = [];

  // Remove power-ups
  for (const [, mesh] of powerupMeshes) {
    scene.remove(mesh);
  }
  powerupMeshes.clear();

  // Remove boundary walls
  for (const wall of boundaryWalls) {
    scene.remove(wall);
  }
  boundaryWalls.length = 0;

  // Remove trajectory trails
  effects.clearTrails();

  // Reset interpolation
  stateBuffer.length = 0;
  serverTimeOffset = null;
  myId = null;
  shakeIntensity = 0;
  hitIndicators.length = 0;

  // Reset HUD
  hud.hide();
  hud.resetMinimapCache();
}

// ============================================================
//  NETWORK CALLBACKS
// ============================================================
net.onWelcome = (data) => {
  myId = data.id;
  mapSize = data.mapSize;
  islandData = data.islands;

  for (const isl of data.islands) {
    const mesh = createIslandMesh(isl);
    scene.add(mesh);
    islandMeshes.push(mesh);
  }

  if (data.powerups) {
    for (const pu of data.powerups) {
      const mesh = createPowerupMesh(pu);
      scene.add(mesh);
      powerupMeshes.set(pu.id, mesh);
    }
  }

  createBoundaryMarkers();
  hud.show();
  audio.init();
};

net.onState = (state) => {
  const now = performance.now();
  const serverTimeMs = state.tick * TICK_INTERVAL;

  // Establish/maintain time offset (local clock -> server clock)
  if (serverTimeOffset === null) {
    serverTimeOffset = now - serverTimeMs;
  } else {
    const expectedOffset = now - serverTimeMs;
    serverTimeOffset += (expectedOffset - serverTimeOffset) * 0.01;
  }

  // Push into buffer
  stateBuffer.push({ serverTime: serverTimeMs, state });

  // Discard states older than 500ms behind render time
  const renderTime = now - serverTimeOffset - INTERP_DELAY;
  while (stateBuffer.length > 2 && stateBuffer[0].serverTime < renderTime - 500) {
    stateBuffer.shift();
  }

  // Manage boat creation/removal from latest state
  const activeIds = new Set(state.players.map(p => p.id));

  for (const [id, boat] of boats) {
    if (!activeIds.has(id)) {
      boat.dispose(scene);
      boats.delete(id);
      effects.clearWake(id);
    }
  }

  for (const p of state.players) {
    if (!boats.has(p.id)) {
      const boat = new BoatModel(p.color, p.id === myId);
      scene.add(boat.group);
      boats.set(p.id, boat);

      if (p.id !== myId) {
        const nameSprite = createNameSprite(p.name, p.color);
        boat.nameSprite = nameSprite;
        boat.group.add(nameSprite);
        nameSprite.position.set(0, 14, 0);
      }
    }
  }

  // Sync power-up meshes
  const activePuIds = new Set(state.powerups.map(p => p.id));
  for (const [id, mesh] of powerupMeshes) {
    if (!activePuIds.has(id)) {
      scene.remove(mesh);
      powerupMeshes.delete(id);
    }
  }
  for (const pu of state.powerups) {
    if (!powerupMeshes.has(pu.id)) {
      const mesh = createPowerupMesh(pu);
      scene.add(mesh);
      powerupMeshes.set(pu.id, mesh);
    }
  }

  hud.updateScoreboard(state.players, myId);
  hud.updatePlayerCount(state.players.length);
};

net.onFire = (data) => {
  effects.cannonFlash(data.x, data.z, data.angle);
  audio.fire();
  if (data.playerId === myId) addShake(0.3);
};

net.onHit = (data) => {
  if (data.targetId) {
    effects.explosion(data.x, data.z);
    audio.explosion();
    if (data.targetId === myId) {
      addShake(1.2);
      const latestState = stateBuffer.length > 0 ? stateBuffer[stateBuffer.length - 1].state : null;
      if (data.shooterId && latestState) {
        const shooter = latestState.players.find(p => p.id === data.shooterId);
        const me = latestState.players.find(p => p.id === myId);
        if (shooter && me) {
          const angle = Math.atan2(shooter.x - me.x, shooter.z - me.z);
          hitIndicators.push({ angle, life: 1.5 });
        }
      }
    }
  } else {
    effects.waterSplash(data.x, data.z);
    audio.splash();
  }
};

net.onKill = (data) => {
  hud.addKillFeedEntry(data.killerName, data.victimName);
  if (data.victimId === myId) {
    hud.showRespawn();
    addShake(2.0);
  }
};

// ============================================================
//  EXTRA GAME EVENTS (bound once after socket connects)
// ============================================================
let gameEventsRegistered = false;

function registerGameEvents() {
  if (gameEventsRegistered) return;
  gameEventsRegistered = true;

  net.socket.on('dash', (data) => {
    effects.dashTrail(data.x, data.z, data.angle);
    audio.dash();
    if (data.playerId === myId) addShake(0.5);
  });
  net.socket.on('powerupSpawn', (data) => {
    if (!powerupMeshes.has(data.id)) {
      const mesh = createPowerupMesh(data);
      scene.add(mesh);
      powerupMeshes.set(data.id, mesh);
    }
  });
  net.socket.on('powerupPickup', (data) => {
    const mesh = powerupMeshes.get(data.id);
    if (mesh) { scene.remove(mesh); powerupMeshes.delete(data.id); }
    if (data.playerId === myId) {
      audio.powerup();
      hud.showPowerupNotification(data.type);
    }
  });
  net.socket.on('shieldBreak', (data) => {
    effects.shieldBreak(data.x, data.z);
    audio.shieldBreak();
  });
}

// ============================================================
//  CAMERA
// ============================================================
const cameraTarget = new THREE.Vector3();
const cameraPos = new THREE.Vector3();
let cameraFirstUpdate = true;
const CAMERA_SMOOTH_SPEED = 6;

// Smooth tracking for local player – eliminates interpolation jitter
const localSmooth = { x: 0, z: 0, angle: 0, ready: false };
const LOCAL_SMOOTH_SPEED = 18;

function updateCamera(x, z, angle, dt) {
  const camDist = 100;
  const camHeight = 35;

  cameraTarget.set(x, 0, z);
  cameraPos.set(
    x - Math.sin(angle) * camDist,
    camHeight,
    z - Math.cos(angle) * camDist
  );

  if (cameraFirstUpdate) {
    camera.position.copy(cameraPos);
    cameraFirstUpdate = false;
  }

  // Frame-rate independent exponential smoothing
  const smoothFactor = 1 - Math.exp(-CAMERA_SMOOTH_SPEED * dt);
  camera.position.lerp(cameraPos, smoothFactor);
  camera.lookAt(cameraTarget);
}

// ============================================================
//  STATE INTERPOLATION HELPERS
// ============================================================
function lerpAngle(a, b, t) {
  let da = b - a;
  if (da > Math.PI) da -= Math.PI * 2;
  if (da < -Math.PI) da += Math.PI * 2;
  return a + da * t;
}

function lerpStates(stateA, stateB, t) {
  const players = [];
  for (const bp of stateB.players) {
    const ap = stateA.players.find(p => p.id === bp.id);
    if (ap) {
      players.push({
        ...bp,
        x: ap.x + (bp.x - ap.x) * t,
        z: ap.z + (bp.z - ap.z) * t,
        angle: lerpAngle(ap.angle, bp.angle, t),
        speed: ap.speed + (bp.speed - ap.speed) * t
      });
    } else {
      players.push(bp);
    }
  }
  return { players, projectiles: stateB.projectiles, powerups: stateB.powerups };
}

function getInterpolatedState() {
  if (stateBuffer.length === 0 || serverTimeOffset === null) return null;

  const renderTime = performance.now() - serverTimeOffset - INTERP_DELAY;

  // Before all buffered states: use oldest
  if (renderTime <= stateBuffer[0].serverTime) {
    return stateBuffer[0].state;
  }

  // Find the pair that straddles renderTime
  for (let i = 0; i < stateBuffer.length - 1; i++) {
    const a = stateBuffer[i];
    const b = stateBuffer[i + 1];
    if (a.serverTime <= renderTime && renderTime < b.serverTime) {
      const t = (renderTime - a.serverTime) / (b.serverTime - a.serverTime);
      return lerpStates(a.state, b.state, t);
    }
  }

  // Past all buffered states: use newest
  return stateBuffer[stateBuffer.length - 1].state;
}

// ============================================================
//  RENDER LOOP
// ============================================================
const clock = new THREE.Clock();
let running = false;
let fpsFrames = 0, fpsLastTime = performance.now();
const fpsEl = document.getElementById('fpsCounter');

function animate() {
  if (!running) return;
  requestAnimationFrame(animate);

  // FPS counter
  fpsFrames++;
  const fpsNow = performance.now();
  if (fpsNow - fpsLastTime >= 1000) {
    fpsEl.textContent = fpsFrames + ' FPS';
    fpsFrames = 0;
    fpsLastTime = fpsNow;
  }

  const dt = Math.min(clock.getDelta(), 0.1);
  const time = clock.elapsedTime;

  net.sendInput(input.getState());

  // Buffered interpolation: render INTERP_DELAY ms behind live
  const interpState = getInterpolatedState();

  if (interpState) {
    for (const cp of interpState.players) {
      const boat = boats.get(cp.id);
      if (!boat) continue;

      let rx = cp.x, rz = cp.z, ra = cp.angle;

      // Smooth local player position to filter interpolation jitter
      if (cp.id === myId) {
        if (!localSmooth.ready) {
          localSmooth.x = cp.x;
          localSmooth.z = cp.z;
          localSmooth.angle = cp.angle;
          localSmooth.ready = true;
        }
        const sf = 1 - Math.exp(-LOCAL_SMOOTH_SPEED * dt);
        localSmooth.x += (cp.x - localSmooth.x) * sf;
        localSmooth.z += (cp.z - localSmooth.z) * sf;
        localSmooth.angle = lerpAngle(localSmooth.angle, cp.angle, sf);
        rx = localSmooth.x;
        rz = localSmooth.z;
        ra = localSmooth.angle;
      }

      boat.update(rx, rz, ra, cp.alive, time);
      boat.setShield(cp.buffs?.shield || false);

      if (cp.alive && Math.abs(cp.speed) > 8) {
        effects.updateWake(cp.id, rx, rz, ra, cp.speed);
      }

      if (cp.id === myId) {
        updateCamera(rx, rz, ra, dt);
        hud.updateHealth(cp.hp);
        hud.updateDash(cp.dashCooldown, 5.0);
        hud.updateBuffs(cp.buffs);

        if (cp.alive && hud.respawnVisible) hud.hideRespawn();
        if (!cp.alive && !hud.respawnVisible) hud.showRespawn();
      }
    }

    effects.updateProjectiles(interpState.projectiles);
    hud.updateMinimap(interpState.players, islandData, myId, mapSize, interpState.powerups);
  }

  // Animate power-ups
  for (const [, mesh] of powerupMeshes) {
    mesh.position.y = 5 + Math.sin(time * 2 + mesh._puId) * 1.5;
    mesh.rotation.y = time * 1.5;
  }

  // Hit indicators
  for (let i = hitIndicators.length - 1; i >= 0; i--) {
    hitIndicators[i].life -= dt;
    if (hitIndicators[i].life <= 0) hitIndicators.splice(i, 1);
  }
  hud.updateHitIndicators(hitIndicators);

  // Charge bar
  if (input.shoot) {
    hud.updateCharge(input.chargeFraction);
  } else {
    hud.hideCharge();
  }

  updateWater(waterObj, dt);
  effects.update(dt);
  renderer.render(scene, camera);
}

// ============================================================
//  RESIZE
// ============================================================
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// ============================================================
//  LOBBY UI
// ============================================================
const joinScreen = document.getElementById('joinScreen');
const lobbyScreen = document.getElementById('lobbyScreen');
const nameInput = document.getElementById('nameInput');
const btnJoin = document.getElementById('btnJoin');
const roomNameInput = document.getElementById('roomNameInput');
const btnCreateRoom = document.getElementById('btnCreateRoom');
const roomListEl = document.getElementById('roomList');
const createRoomError = document.getElementById('createRoomError');
const selectedRoomLabel = document.getElementById('selectedRoomLabel');
const btnBackToLobby = document.getElementById('btnBackToLobby');
const btnLeaveRoom = document.getElementById('btnLeaveRoom');

let selectedRoom = null;

function showLobby() {
  joinScreen.style.display = 'none';
  lobbyScreen.style.display = 'flex';
  createRoomError.textContent = '';
  roomNameInput.value = '';
  roomNameInput.focus();
  if (net.socket) net.getRooms();
}

function showNameInput(roomName) {
  selectedRoom = roomName;
  selectedRoomLabel.textContent = `Room: ${roomName}`;
  lobbyScreen.style.display = 'none';
  joinScreen.style.display = 'flex';
  nameInput.focus();
}

function showGame() {
  joinScreen.style.display = 'none';
  lobbyScreen.style.display = 'none';
}

function escapeHtml(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function renderRoomList(roomsList) {
  if (!roomsList || roomsList.length === 0) {
    roomListEl.innerHTML = '<div class="room-empty">No rooms available. Create one!</div>';
    return;
  }

  roomListEl.innerHTML = roomsList.map(r => {
    const full = r.players >= r.maxPlayers;
    return `<div class="room-item">
      <div class="room-item-info">
        <span class="room-item-name">${escapeHtml(r.name)}</span>
        <span class="room-item-players ${full ? 'full' : ''}">${r.players}/${r.maxPlayers} players</span>
      </div>
      <button data-room="${escapeHtml(r.name)}" ${full ? 'disabled' : ''}>
        ${full ? 'FULL' : 'JOIN'}
      </button>
    </div>`;
  }).join('');

  // Attach click events
  roomListEl.querySelectorAll('button[data-room]').forEach(btn => {
    btn.addEventListener('click', () => {
      const roomName = btn.getAttribute('data-room');
      showNameInput(roomName);
    });
  });
}

function joinRoomAndPlay(roomName) {
  showGame();
  registerGameEvents();
  net.joinRoom(roomName, playerName);

  if (!running) {
    running = true;
    clock.start();
    animate();
  }
}

function leaveRoom() {
  running = false;
  net.leaveRoom();
  cleanupGameState();
  showLobby();
}

// Room list updates from server
net.onRoomList = (list) => {
  renderRoomList(list);
};

net.onRoomError = (msg) => {
  createRoomError.textContent = msg;
};

// ============================================================
//  EVENT LISTENERS
// ============================================================

// Step 1: Select room (create or join from list) -> go to name input
btnCreateRoom.addEventListener('click', () => {
  const roomName = roomNameInput.value.trim();
  if (!roomName) {
    createRoomError.textContent = 'Please enter a room name.';
    return;
  }
  createRoomError.textContent = '';

  net.createRoom(roomName, (res) => {
    if (res.error) {
      createRoomError.textContent = res.error;
      return;
    }
    showNameInput(roomName);
  });
});

roomNameInput.addEventListener('keydown', (e) => {
  if (e.code === 'Enter') btnCreateRoom.click();
});

// Step 2: Enter name -> join game
function startGame() {
  playerName = nameInput.value.trim() || 'Sailor';
  if (!selectedRoom) return;
  joinRoomAndPlay(selectedRoom);
}

btnJoin.addEventListener('click', startGame);
nameInput.addEventListener('keydown', (e) => {
  if (e.code === 'Enter') startGame();
});

// Back to lobby from name input
btnBackToLobby.addEventListener('click', showLobby);

// Leave room button (in-game)
btnLeaveRoom.addEventListener('click', leaveRoom);

// Music toggle
const musicBtn = document.getElementById('musicToggle');
musicBtn.addEventListener('click', () => {
  const playing = audio.toggleMusic();
  musicBtn.classList.toggle('muted', !playing);
});

// Connect socket and show lobby on load
net.connect();
showLobby();
