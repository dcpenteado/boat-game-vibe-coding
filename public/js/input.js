const CHARGE_TIME = 2.0; // matches FIRE_CHARGE_TIME

export class InputManager {
  constructor() {
    // Keyboard state
    this.keys = { forward: false, backward: false, left: false, right: false };
    this.shoot = false;
    this.dash = false;
    this.mine = false;
    this._chargeStart = 0;

    // Touch state
    this.touchKeys = { forward: false, backward: false, left: false, right: false };
    this.touchShoot = false;
    this.touchDash = false;
    this.touchMine = false;
    this._touchChargeStart = 0;

    // Detect touch device
    this.isTouchDevice = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);

    // Keyboard listeners
    document.addEventListener('keydown', (e) => this._onKey(e, true));
    document.addEventListener('keyup', (e) => this._onKey(e, false));

    // Mouse listeners (disabled on touch devices to prevent ghost clicks)
    document.addEventListener('mousedown', (e) => {
      if (e.button === 0 && !this.isTouchDevice) this._startShoot();
    });
    document.addEventListener('mouseup', (e) => {
      if (e.button === 0 && !this.isTouchDevice) this.shoot = false;
    });

    // Init touch controls if on touch device
    if (this.isTouchDevice) {
      this._initTouchControls();
    }
  }

  _initTouchControls() {
    const touchEl = document.getElementById('touchControls');
    if (touchEl) touchEl.style.display = 'block';

    this._initJoystick();
    this._initFireButton();
    this._initDashButton();
    this._initMineButton();
  }

  _initJoystick() {
    const zone = document.getElementById('joystickZone');
    if (!zone || typeof nipplejs === 'undefined') return;

    this.joystick = nipplejs.create({
      zone: zone,
      mode: 'static',
      position: { left: '80px', bottom: '80px' },
      color: 'rgba(0, 229, 155, 0.5)',
      size: 120,
      threshold: 0.1,
      fadeTime: 0,
      restOpacity: 0.5
    });

    this.joystick.on('move', (evt, data) => {
      const angle = data.angle.radian;
      const force = Math.min(data.force, 1);
      const x = Math.cos(angle) * force;
      const y = Math.sin(angle) * force;

      const THRESHOLD = 0.3;
      this.touchKeys.forward  = y > THRESHOLD;
      this.touchKeys.backward = y < -THRESHOLD;
      this.touchKeys.left     = x < -THRESHOLD;
      this.touchKeys.right    = x > THRESHOLD;
    });

    this.joystick.on('end', () => {
      this.touchKeys.forward = false;
      this.touchKeys.backward = false;
      this.touchKeys.left = false;
      this.touchKeys.right = false;
    });
  }

  _initFireButton() {
    const btn = document.getElementById('touchFireBtn');
    if (!btn) return;

    btn.addEventListener('touchstart', (e) => {
      e.preventDefault();
      this.touchShoot = true;
      this._touchChargeStart = performance.now();
    });
    btn.addEventListener('touchend', (e) => {
      e.preventDefault();
      this.touchShoot = false;
    });
    btn.addEventListener('touchcancel', (e) => {
      e.preventDefault();
      this.touchShoot = false;
    });
  }

  _initDashButton() {
    const btn = document.getElementById('touchDashBtn');
    if (!btn) return;

    btn.addEventListener('touchstart', (e) => {
      e.preventDefault();
      this.touchDash = true;
    });
    btn.addEventListener('touchend', (e) => {
      e.preventDefault();
      this.touchDash = false;
    });
    btn.addEventListener('touchcancel', (e) => {
      e.preventDefault();
      this.touchDash = false;
    });
  }

  _initMineButton() {
    const btn = document.getElementById('touchMineBtn');
    if (!btn) return;

    btn.addEventListener('touchstart', (e) => {
      e.preventDefault();
      this.touchMine = true;
    });
    btn.addEventListener('touchend', (e) => {
      e.preventDefault();
      this.touchMine = false;
    });
    btn.addEventListener('touchcancel', (e) => {
      e.preventDefault();
      this.touchMine = false;
    });
  }

  _startShoot() {
    if (!this.shoot) {
      this.shoot = true;
      this._chargeStart = performance.now();
    }
  }

  _onKey(e, pressed) {
    switch (e.code) {
      case 'KeyW': case 'ArrowUp':    this.keys.forward  = pressed; break;
      case 'KeyS': case 'ArrowDown':  this.keys.backward = pressed; break;
      case 'KeyA': case 'ArrowLeft':  this.keys.left     = pressed; break;
      case 'KeyD': case 'ArrowRight': this.keys.right    = pressed; break;
      case 'Space':
        if (pressed) this._startShoot(); else this.shoot = false;
        e.preventDefault();
        break;
      case 'ShiftLeft': case 'ShiftRight': this.dash = pressed; e.preventDefault(); break;
      case 'KeyQ': this.mine = pressed; break;
    }
  }

  get chargeFraction() {
    const kbCharging = this.shoot && this._chargeStart;
    const touchCharging = this.touchShoot && this._touchChargeStart;

    if (kbCharging) {
      return Math.min(1, (performance.now() - this._chargeStart) / 1000 / CHARGE_TIME);
    }
    if (touchCharging) {
      return Math.min(1, (performance.now() - this._touchChargeStart) / 1000 / CHARGE_TIME);
    }
    return 0;
  }

  getState() {
    return {
      forward:  this.keys.forward  || this.touchKeys.forward,
      backward: this.keys.backward || this.touchKeys.backward,
      left:     this.keys.left     || this.touchKeys.left,
      right:    this.keys.right    || this.touchKeys.right,
      shoot:    this.shoot         || this.touchShoot,
      dash:     this.dash          || this.touchDash,
      mine:     this.mine          || this.touchMine,
      chargeFraction: this.chargeFraction
    };
  }

  get hasTouchControls() {
    return this.isTouchDevice;
  }
}
