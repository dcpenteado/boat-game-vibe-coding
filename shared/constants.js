// ====== MAP ======
export const MAP_SIZE = 5000;
export const MAP_HALF = MAP_SIZE / 2;

// ====== SERVER TICK ======
export const TICK_RATE = 20;
export const TICK_INTERVAL = 1000 / TICK_RATE;

// ====== BOAT PHYSICS ======
export const BOAT_MAX_SPEED = 120;
export const BOAT_ACCELERATION = 60;
export const BOAT_REVERSE_ACCEL = 30;
export const BOAT_DRAG = 0.98;
export const BOAT_ANGULAR_SPEED = 1.0;
export const BOAT_MIN_TURN_FRAC = 0.3;
export const BOAT_LENGTH = 12;
export const BOAT_WIDTH = 5;

// ====== DASH ======
export const DASH_SPEED_BOOST = 250;
export const DASH_DURATION = 0.4;
export const DASH_COOLDOWN = 5.0;

// ====== COMBAT ======
export const FIRE_MIN_SPEED = 200;
export const FIRE_MAX_SPEED = 600;
export const FIRE_CHARGE_TIME = 2.0;
export const PROJECTILE_GRAVITY = 100;
export const PROJECTILE_LAUNCH_ANGLE = Math.PI / 10;
export const CANNONBALL_DIRECT_RADIUS = 20.0;
export const CANNONBALL_DIRECT_DAMAGE = 100;
export const CANNONBALL_SPLASH_RADIUS = 50.0;
export const CANNONBALL_SPLASH_DAMAGE = 50;
export const FIRE_COOLDOWN = 1.0;
export const MAX_HP = 100;
export const RESPAWN_TIME = 9.0;

// ====== POWER-UPS ======
export const POWERUP_SPAWN_INTERVAL = 8.0;
export const POWERUP_MAX = 6;
export const POWERUP_RADIUS = 8;
export const POWERUP_TYPES = ['health', 'speed', 'trishot', 'shield'];
export const POWERUP_DURATION = {
  speed: 6.0,
  trishot: 8.0,
  shield: 5.0
};

// ====== MINES ======
export const MINE_COOLDOWN = 30.0;
export const MINE_LIFETIME = 180.0;
export const MINE_DAMAGE = 100;
export const MINE_RADIUS = 8;

// ====== RAMMING ======
export const RAM_COLLISION_RADIUS = 8;
export const RAM_MIN_RELATIVE_SPEED = 40;
export const RAM_DAMAGE_FACTOR = 0.4;
export const RAM_MAX_DAMAGE = 80;
export const RAM_KNOCKBACK_FORCE = 120;
export const RAM_COOLDOWN = 1.0;
export const RAM_DASH_MULTIPLIER = 1.5;
export const RAM_SLOWER_DAMAGE_RATIO = 0.65;
export const RAM_FASTER_DAMAGE_RATIO = 0.35;

// ====== BOUNTY ======
export const BOUNTY_MIN_KILLS = 3;
export const BOUNTY_KILL_BONUS = 100;

// ====== GAME ======
export const MAX_PLAYERS = 16;
export const PLAYER_COLORS = [
  0xe74c3c, 0x3498db, 0x2ecc71, 0xf39c12, 0x9b59b6,
  0x1abc9c, 0xe67e22, 0xecf0f1, 0xff6b81, 0x7bed9f,
  0x00bcd4, 0xff5722, 0x8bc34a, 0x673ab7, 0xffc107,
  0x795548
];
