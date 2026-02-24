const POWERUP_NAMES = {
  health: 'HEALTH +40',
  speed: 'SPEED',
  trishot: 'TRIPLE SHOT',
  shield: 'SHIELD'
};
const POWERUP_COLORS_CSS = {
  health: '#2ecc71',
  speed: '#f39c12',
  trishot: '#e74c3c',
  shield: '#3498db'
};

export class HUD {
  constructor() {
    this.el = {
      hud: document.getElementById('hud'),
      healthFill: document.getElementById('healthFill'),
      healthText: document.getElementById('healthText'),
      dashFill: document.getElementById('dashFill'),
      dashLabel: document.getElementById('dashLabel'),
      buffsContainer: document.getElementById('buffsContainer'),
      killFeed: document.getElementById('killFeed'),
      scoreboard: document.getElementById('scoreboard'),
      playerCount: document.getElementById('playerCount'),
      respawn: document.getElementById('respawnOverlay'),
      minimapCanvas: document.getElementById('minimapCanvas'),
      hitIndicators: document.getElementById('hitIndicators'),
      powerupNotification: document.getElementById('powerupNotification'),
      chargeBar: document.getElementById('chargeBar'),
      chargeFill: document.getElementById('chargeFill')
    };
    this.minimapCtx = this.el.minimapCanvas.getContext('2d');
    this._minimapCache = null;
    this.respawnVisible = false;
    this._puNotifTimer = null;
  }

  show() {
    this.el.hud.style.display = 'block';
  }

  hide() {
    this.el.hud.style.display = 'none';
  }

  resetMinimapCache() {
    this._minimapCache = null;
  }

  updateHealth(hp) {
    const pct = Math.max(0, hp);
    this.el.healthFill.style.width = pct + '%';
    this.el.healthText.textContent = Math.max(0, Math.round(hp));
    const hue = (pct / 100) * 120;
    this.el.healthFill.style.background =
      `linear-gradient(90deg, hsl(${hue},80%,45%), hsl(${hue + 10},90%,55%))`;
  }

  updateDash(cooldown, maxCooldown) {
    const ready = cooldown <= 0;
    const pct = ready ? 100 : ((1 - cooldown / maxCooldown) * 100);
    this.el.dashFill.style.width = pct + '%';
    this.el.dashFill.style.background = ready
      ? 'linear-gradient(90deg, #00e59b, #00c080)'
      : 'linear-gradient(90deg, #3498db, #2980b9)';
    this.el.dashLabel.style.color = ready ? '#00e59b' : '#5a6a80';
  }

  updateBuffs(buffs) {
    if (!buffs) return;
    let html = '';
    if (buffs.speed) html += `<div class="buff-icon" style="background:${POWERUP_COLORS_CSS.speed}">SPD</div>`;
    if (buffs.trishot) html += `<div class="buff-icon" style="background:${POWERUP_COLORS_CSS.trishot}">TRI</div>`;
    if (buffs.shield) html += `<div class="buff-icon" style="background:${POWERUP_COLORS_CSS.shield}">SHD</div>`;
    this.el.buffsContainer.innerHTML = html;
  }

  showPowerupNotification(type) {
    const el = this.el.powerupNotification;
    el.textContent = POWERUP_NAMES[type] || type.toUpperCase();
    el.style.color = POWERUP_COLORS_CSS[type] || '#fff';
    el.style.display = 'block';
    el.style.animation = 'none';
    el.offsetHeight; // reflow
    el.style.animation = 'puNotif 1.5s ease-out forwards';
    if (this._puNotifTimer) clearTimeout(this._puNotifTimer);
    this._puNotifTimer = setTimeout(() => { el.style.display = 'none'; }, 1500);
  }

  updateHitIndicators(indicators) {
    let html = '';
    for (const hi of indicators) {
      const opacity = Math.min(1, hi.life);
      const deg = (hi.angle * 180 / Math.PI);
      html += `<div class="hit-arrow" style="transform:rotate(${deg}deg);opacity:${opacity}"></div>`;
    }
    this.el.hitIndicators.innerHTML = html;
  }

  _buildMinimapCache(islandData, mapSize) {
    const s = 160;
    const c = document.createElement('canvas');
    c.width = s; c.height = s;
    const ctx = c.getContext('2d');

    ctx.fillStyle = '#0a1628';
    ctx.fillRect(0, 0, s, s);

    ctx.strokeStyle = '#1a2540';
    ctx.lineWidth = 0.5;
    for (let i = 0; i < s; i += 20) {
      ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, s); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, i); ctx.lineTo(s, i); ctx.stroke();
    }

    ctx.strokeStyle = '#1e3050';
    ctx.lineWidth = 1;
    ctx.strokeRect(0, 0, s, s);

    ctx.fillStyle = '#2d5a2d';
    for (const isl of islandData) {
      const ix = (isl.x / mapSize + 0.5) * s;
      const iz = (isl.z / mapSize + 0.5) * s;
      const ir = (isl.radius / mapSize) * s;
      ctx.beginPath();
      ctx.arc(ix, iz, Math.max(3, ir), 0, Math.PI * 2);
      ctx.fill();
    }

    this._minimapCache = c;
  }

  updateMinimap(players, islandData, myId, mapSize, powerups) {
    const ctx = this.minimapCtx;
    const s = 160;

    // Build static cache once (grid + islands)
    if (!this._minimapCache) {
      this._buildMinimapCache(islandData, mapSize);
    }

    // Blit cached static layer
    ctx.drawImage(this._minimapCache, 0, 0);

    // Dynamic: power-ups
    if (powerups) {
      for (const pu of powerups) {
        const px = (pu.x / mapSize + 0.5) * s;
        const pz = (pu.z / mapSize + 0.5) * s;
        ctx.fillStyle = POWERUP_COLORS_CSS[pu.type] || '#fff';
        ctx.beginPath();
        ctx.arc(px, pz, 3, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // Dynamic: players
    for (const p of players) {
      if (!p.alive) continue;
      const px = (p.x / mapSize + 0.5) * s;
      const pz = (p.z / mapSize + 0.5) * s;
      const isMe = p.id === myId;

      if (isMe) {
        ctx.strokeStyle = '#00ff88';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(px, pz);
        ctx.lineTo(px + Math.sin(p.angle) * 8, pz + Math.cos(p.angle) * 8);
        ctx.stroke();
      }

      ctx.fillStyle = isMe ? '#00ff88' : '#ff4444';
      ctx.beginPath();
      ctx.arc(px, pz, isMe ? 4 : 3, 0, Math.PI * 2);
      ctx.fill();

      if (isMe) {
        ctx.strokeStyle = 'rgba(0,255,136,0.3)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(px, pz, 7, 0, Math.PI * 2);
        ctx.stroke();
      }
    }
  }

  addKillFeedEntry(killer, victim) {
    const div = document.createElement('div');
    div.className = 'kill-entry';
    div.innerHTML = `<span class="killer">${this._esc(killer)}</span> <span class="action">sunk</span> <span class="victim">${this._esc(victim)}</span>`;
    this.el.killFeed.prepend(div);
    setTimeout(() => div.remove(), 5000);
    while (this.el.killFeed.children.length > 5) this.el.killFeed.lastChild.remove();
  }

  updateScoreboard(players, myId) {
    const sorted = [...players].sort((a, b) => b.score - a.score);
    this.el.scoreboard.innerHTML = sorted.slice(0, 5).map((p, i) =>
      `<div class="score-row ${p.id === myId ? 'me' : ''}">
        <span class="rank">#${i + 1}</span>
        <span class="name">${this._esc(p.name)}</span>
        <span class="score">${p.kills}K / ${p.deaths}D</span>
      </div>`
    ).join('');
  }

  updatePlayerCount(count) {
    this.el.playerCount.textContent = `${count}/10 Players`;
  }

  updateCharge(fraction) {
    this.el.chargeBar.style.display = 'block';
    this.el.chargeFill.style.width = (fraction * 100) + '%';
  }

  hideCharge() {
    this.el.chargeBar.style.display = 'none';
    this.el.chargeFill.style.width = '0%';
  }

  showRespawn() { this.el.respawn.style.display = 'flex'; this.respawnVisible = true; }
  hideRespawn() { this.el.respawn.style.display = 'none'; this.respawnVisible = false; }

  _esc(s) {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }
}
