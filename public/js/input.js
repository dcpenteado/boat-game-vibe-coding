const CHARGE_TIME = 2.0; // matches FIRE_CHARGE_TIME

export class InputManager {
  constructor() {
    this.keys = { forward: false, backward: false, left: false, right: false };
    this.shoot = false;
    this.dash = false;
    this._chargeStart = 0;

    document.addEventListener('keydown', (e) => this._onKey(e, true));
    document.addEventListener('keyup', (e) => this._onKey(e, false));
    document.addEventListener('mousedown', (e) => {
      if (e.button === 0) this._startShoot();
    });
    document.addEventListener('mouseup', (e) => {
      if (e.button === 0) this.shoot = false;
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
    }
  }

  get chargeFraction() {
    if (!this.shoot || !this._chargeStart) return 0;
    const elapsed = (performance.now() - this._chargeStart) / 1000;
    return Math.min(1, elapsed / CHARGE_TIME);
  }

  getState() {
    return {
      forward:  this.keys.forward,
      backward: this.keys.backward,
      left:     this.keys.left,
      right:    this.keys.right,
      shoot:    this.shoot,
      dash:     this.dash,
      chargeFraction: this.chargeFraction
    };
  }
}
