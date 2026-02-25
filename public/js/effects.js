import * as THREE from 'three';

export class EffectsManager {
  constructor(scene) {
    this.scene = scene;
    this.particles = [];
    this.wakes = new Map();
    this.projectileMeshes = new Map();

    // Create circular particle texture
    this._circleTexture = this._makeCircleTexture();

    // Shared geometries
    this._projGeo = new THREE.SphereGeometry(1.2, 8, 8);
    this._projMat = new THREE.MeshPhongMaterial({
      color: 0x111111,
      emissive: 0x331100,
      emissiveIntensity: 0.5
    });

    // Projectile glow
    this._projGlowMat = new THREE.SpriteMaterial({
      map: this._circleTexture,
      color: 0xff6600,
      transparent: true,
      opacity: 0.4,
      blending: THREE.AdditiveBlending
    });

    // Trajectory trails
    this.trajectoryTrails = new Map(); // projectile id -> { line, pointCount, maxPoints }
    this.fadingTrails = [];            // trails fading out after projectile disappears

    // Sprite pool
    this._pool = [];
    const POOL_SIZE = 120;
    for (let i = 0; i < POOL_SIZE; i++) {
      const mat = new THREE.SpriteMaterial({
        map: this._circleTexture,
        transparent: true,
        depthWrite: false
      });
      const sprite = new THREE.Sprite(mat);
      sprite.visible = false;
      this.scene.add(sprite);
      this._pool.push(sprite);
    }
  }

  _makeCircleTexture() {
    const size = 64;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    const half = size / 2;
    const gradient = ctx.createRadialGradient(half, half, 0, half, half, half);
    gradient.addColorStop(0, 'rgba(255,255,255,1)');
    gradient.addColorStop(0.4, 'rgba(255,255,255,0.6)');
    gradient.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, size, size);
    const texture = new THREE.CanvasTexture(canvas);
    return texture;
  }

  _acquireSprite(color, opacity, additive = true) {
    let sprite;
    if (this._pool.length > 0) {
      sprite = this._pool.pop();
    } else {
      // Overflow: create a new one (rare)
      const mat = new THREE.SpriteMaterial({
        map: this._circleTexture,
        transparent: true,
        depthWrite: false
      });
      sprite = new THREE.Sprite(mat);
      this.scene.add(sprite);
    }
    const mat = sprite.material;
    mat.color.set(color);
    mat.opacity = opacity;
    mat.blending = additive ? THREE.AdditiveBlending : THREE.NormalBlending;
    mat.needsUpdate = true;
    sprite.visible = true;
    return sprite;
  }

  _releaseSprite(sprite) {
    sprite.visible = false;
    sprite.position.set(0, -1000, 0);
    this._pool.push(sprite);
  }

  // ---------- Water splash ----------
  waterSplash(x, z) {
    const count = 25;
    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2 + (Math.random() - 0.5) * 0.4;
      const speed = 8 + Math.random() * 18;
      const sprite = this._acquireSprite(0x88ccff, 0.7);
      const s = 1 + Math.random() * 2;
      sprite.scale.set(s, s, 1);
      sprite.position.set(x, 0.5, z);
      this.particles.push({
        mesh: sprite,
        vx: Math.cos(angle) * speed,
        vy: 14 + Math.random() * 20,
        vz: Math.sin(angle) * speed,
        life: 0,
        maxLife: 0.6 + Math.random() * 0.5,
        gravity: -35
      });
    }
  }

  // ---------- Cannon flash ----------
  cannonFlash(x, z, angle) {
    const sprite = this._acquireSprite(0xff8800, 1.0);
    sprite.scale.set(5, 5, 1);
    const fx = x + Math.sin(angle) * 3;
    const fz = z + Math.cos(angle) * 3;
    sprite.position.set(fx, 3, fz);
    this.particles.push({
      mesh: sprite,
      vx: 0, vy: 0, vz: 0,
      life: 0, maxLife: 0.12,
      gravity: 0,
      scaleDecay: true,
      startScale: 5
    });

    // Smoke puffs
    for (let i = 0; i < 4; i++) {
      const smoke = this._acquireSprite(0x888888, 0.5, false);
      smoke.scale.set(1.5, 1.5, 1);
      smoke.position.set(fx, 3, fz);
      const sa = angle + (Math.random() - 0.5) * 0.8;
      this.particles.push({
        mesh: smoke,
        vx: Math.sin(sa) * (3 + Math.random() * 4),
        vy: 2 + Math.random() * 3,
        vz: Math.cos(sa) * (3 + Math.random() * 4),
        life: 0,
        maxLife: 0.6 + Math.random() * 0.3,
        gravity: -2,
        scaleGrow: true
      });
    }
  }

  // ---------- Explosion ----------
  explosion(x, z) {
    this.waterSplash(x, z);

    // Fire particles
    for (let i = 0; i < 16; i++) {
      const sprite = this._acquireSprite(i < 8 ? 0xff4400 : 0xffaa00, 0.9);
      const s = 1.5 + Math.random() * 3;
      sprite.scale.set(s, s, 1);
      sprite.position.set(x, 1, z);
      const a = Math.random() * Math.PI * 2;
      this.particles.push({
        mesh: sprite,
        vx: Math.cos(a) * (6 + Math.random() * 10),
        vy: 12 + Math.random() * 18,
        vz: Math.sin(a) * (6 + Math.random() * 10),
        life: 0,
        maxLife: 0.4 + Math.random() * 0.3,
        gravity: -20
      });
    }
  }

  // ---------- Wake trail ----------
  updateWake(playerId, x, z, angle, speed) {
    if (!this.wakes.has(playerId)) this.wakes.set(playerId, { lastSpawn: 0 });
    const wake = this.wakes.get(playerId);
    const now = performance.now();

    const absSpeed = Math.abs(speed);
    const interval = absSpeed > 60 ? 60 : absSpeed > 30 ? 100 : 180;

    if (now - wake.lastSpawn < interval) return;
    wake.lastSpawn = now;

    const rearX = x - Math.sin(angle) * 6;
    const rearZ = z - Math.cos(angle) * 6;

    // Left and right wake lines
    const perpX = Math.cos(angle);
    const perpZ = -Math.sin(angle);

    for (const side of [-1, 1]) {
      const sprite = this._acquireSprite(0xaaddff, 0.3);
      const s = Math.min(2.5, absSpeed * 0.02);
      sprite.scale.set(s, s, 1);
      sprite.position.set(
        rearX + perpX * side * 2,
        0.15,
        rearZ + perpZ * side * 2
      );
      this.particles.push({
        mesh: sprite,
        vx: perpX * side * 2,
        vy: 0,
        vz: perpZ * side * 2,
        life: 0,
        maxLife: 1.2,
        gravity: 0,
        scaleGrow: true
      });
    }
  }

  // ---------- Projectile visuals ----------
  updateProjectiles(projList) {
    const activeIds = new Set(projList.map(p => p.id));

    // Remove gone projectiles
    for (const [id, group] of this.projectileMeshes) {
      if (!activeIds.has(id)) {
        if (group._shadow) {
          this.scene.remove(group._shadow);
          group._shadow.material.dispose();
        }
        this.scene.remove(group);
        this.projectileMeshes.delete(id);
      }
    }

    // Move trails of removed projectiles to fading list
    for (const [id, trail] of this.trajectoryTrails) {
      if (!activeIds.has(id)) {
        this.fadingTrails.push({
          line: trail.line,
          fadeTime: 0,
          maxFadeTime: 2.0,
          startOpacity: trail.line.material.opacity
        });
        this.trajectoryTrails.delete(id);
      }
    }

    // Update/add
    for (const p of projList) {
      let group = this.projectileMeshes.get(p.id);
      if (!group) {
        group = new THREE.Group();
        const ball = new THREE.Mesh(this._projGeo, this._projMat);
        group.add(ball);
        // Glow
        const glow = new THREE.Sprite(this._projGlowMat.clone());
        glow.scale.set(5, 5, 1);
        group.add(glow);
        // Shadow on water
        const shadowMat = new THREE.SpriteMaterial({
          map: this._circleTexture,
          color: 0x000000,
          transparent: true,
          opacity: 0.3,
          blending: THREE.NormalBlending,
          depthWrite: false
        });
        const shadow = new THREE.Sprite(shadowMat);
        shadow.scale.set(3.5, 3.5, 1);
        shadow.renderOrder = -1;
        group._shadow = shadow;
        this.scene.add(shadow);
        this.scene.add(group);
        this.projectileMeshes.set(p.id, group);
      }
      const y = p.y != null ? p.y : 2.5;
      group.position.set(p.x, y, p.z);
      // Update shadow position on water surface
      if (group._shadow) {
        group._shadow.position.set(p.x, 0.2, p.z);
        const shadowScale = Math.max(1, 1 + y * 0.05);
        group._shadow.scale.set(shadowScale, shadowScale, 1);
        group._shadow.material.opacity = Math.max(0.05, 0.3 - y * 0.003);
      }

      // Update trajectory trail
      this._updateTrail(p.id, p.x, y, p.z);
    }
  }

  // ---------- Trajectory trail ----------
  _updateTrail(id, x, y, z) {
    const MAX_POINTS = 300;
    let trail = this.trajectoryTrails.get(id);

    if (!trail) {
      const geometry = new THREE.BufferGeometry();
      const positions = new Float32Array(MAX_POINTS * 3);
      geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
      geometry.setDrawRange(0, 0);

      const material = new THREE.LineBasicMaterial({
        color: 0xff6633,
        transparent: true,
        opacity: 0.5,
        blending: THREE.AdditiveBlending,
        depthWrite: false
      });

      const line = new THREE.Line(geometry, material);
      this.scene.add(line);
      trail = { line, pointCount: 0, maxPoints: MAX_POINTS };
      this.trajectoryTrails.set(id, trail);
    }

    if (trail.pointCount < trail.maxPoints) {
      const positions = trail.line.geometry.attributes.position.array;
      const idx = trail.pointCount * 3;
      positions[idx] = x;
      positions[idx + 1] = y;
      positions[idx + 2] = z;
      trail.pointCount++;
      trail.line.geometry.setDrawRange(0, trail.pointCount);
      trail.line.geometry.attributes.position.needsUpdate = true;
    }
  }

  clearTrails() {
    for (const [, trail] of this.trajectoryTrails) {
      this.scene.remove(trail.line);
      trail.line.geometry.dispose();
      trail.line.material.dispose();
    }
    this.trajectoryTrails.clear();
    for (const trail of this.fadingTrails) {
      this.scene.remove(trail.line);
      trail.line.geometry.dispose();
      trail.line.material.dispose();
    }
    this.fadingTrails.length = 0;
  }

  // ---------- Per-frame update ----------
  update(dt) {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life += dt;

      if (p.life >= p.maxLife) {
        this._releaseSprite(p.mesh);
        this.particles.splice(i, 1);
        continue;
      }

      // Move
      p.mesh.position.x += p.vx * dt;
      p.mesh.position.y += p.vy * dt;
      p.mesh.position.z += p.vz * dt;
      p.vy += (p.gravity || 0) * dt;

      // Don't go below water
      if (p.mesh.position.y < 0.1 && p.gravity) {
        p.mesh.position.y = 0.1;
        p.vy = 0;
        p.vx *= 0.9;
        p.vz *= 0.9;
      }

      const frac = 1 - p.life / p.maxLife;

      // Fade out
      if (!p._initOpacity) p._initOpacity = p.mesh.material.opacity;
      p.mesh.material.opacity = frac * p._initOpacity;

      // Scale decay (flash)
      if (p.scaleDecay) {
        const s = frac * (p.startScale || 4);
        p.mesh.scale.set(s, s, 1);
      }

      // Scale grow (wake/smoke)
      if (p.scaleGrow) {
        const grow = 1 + (1 - frac) * 3;
        p.mesh.scale.set(grow, grow, 1);
      }
    }

    // Fade out finished trajectory trails
    for (let i = this.fadingTrails.length - 1; i >= 0; i--) {
      const trail = this.fadingTrails[i];
      trail.fadeTime += dt;

      if (trail.fadeTime >= trail.maxFadeTime) {
        this.scene.remove(trail.line);
        trail.line.geometry.dispose();
        trail.line.material.dispose();
        this.fadingTrails.splice(i, 1);
        continue;
      }

      const frac = 1 - trail.fadeTime / trail.maxFadeTime;
      trail.line.material.opacity = trail.startOpacity * frac;
    }
  }

  // ---------- Mine explosion ----------
  mineExplosion(x, z) {
    this.waterSplash(x, z);

    for (let i = 0; i < 24; i++) {
      const color = i < 10 ? 0xff2200 : i < 18 ? 0xff6600 : 0xffaa00;
      const sprite = this._acquireSprite(color, 0.9);
      const s = 2 + Math.random() * 4;
      sprite.scale.set(s, s, 1);
      sprite.position.set(x, 1, z);
      const a = Math.random() * Math.PI * 2;
      this.particles.push({
        mesh: sprite,
        vx: Math.cos(a) * (8 + Math.random() * 15),
        vy: 15 + Math.random() * 25,
        vz: Math.sin(a) * (8 + Math.random() * 15),
        life: 0,
        maxLife: 0.5 + Math.random() * 0.4,
        gravity: -25
      });
    }
  }

  // ---------- Dash trail ----------
  dashTrail(x, z, angle) {
    for (let i = 0; i < 20; i++) {
      const offset = i * 3;
      const bx = x - Math.sin(angle) * offset;
      const bz = z - Math.cos(angle) * offset;
      const sprite = this._acquireSprite(0x00ccff, 0.6);
      const s = 2 + Math.random();
      sprite.scale.set(s, s, 1);
      sprite.position.set(
        bx + (Math.random() - 0.5) * 3,
        0.3 + Math.random() * 2,
        bz + (Math.random() - 0.5) * 3
      );
      this.particles.push({
        mesh: sprite,
        vx: (Math.random() - 0.5) * 5,
        vy: 1 + Math.random() * 3,
        vz: (Math.random() - 0.5) * 5,
        life: 0,
        maxLife: 0.4 + Math.random() * 0.3,
        gravity: -5,
        scaleGrow: true
      });
    }
  }

  // ---------- Shield break ----------
  shieldBreak(x, z) {
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2;
      const sprite = this._acquireSprite(0x3498db, 0.8);
      sprite.scale.set(2, 2, 1);
      sprite.position.set(x, 3, z);
      this.particles.push({
        mesh: sprite,
        vx: Math.cos(a) * 20,
        vy: 5 + Math.random() * 5,
        vz: Math.sin(a) * 20,
        life: 0,
        maxLife: 0.5,
        gravity: -10
      });
    }
  }

  // ---------- Cleanup ----------
  clearWake(playerId) {
    this.wakes.delete(playerId);
  }
}
