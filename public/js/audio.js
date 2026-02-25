// Audio manager using MP3 files
// Replace the placeholder files in public/sounds/ with your custom sounds
export class AudioManager {
  constructor() {
    this._initialized = false;
    this._sfxVolume = 0.5;
    this._musicVolume = 0.3;
    this._musicPlaying = true;
    this._sounds = {};
    this._music = null;
  }

  init() {
    if (this._initialized) return;
    this._initialized = true;

    const sfxNames = ['fire', 'hit', 'explosion', 'splash', 'dash', 'powerup', 'shield_break', 'ram'];
    for (const name of sfxNames) {
      this._sounds[name] = new Audio(`sounds/${name}.mp3`);
      this._sounds[name].volume = this._sfxVolume;
      this._sounds[name].preload = 'auto';
    }

    this._music = new Audio('sounds/music.mp3');
    this._music.loop = true;
    this._music.volume = this._musicVolume;
    this._music.preload = 'auto';

    if (this._musicPlaying) {
      this._music.play().catch(() => {});
    }
  }

  _play(name) {
    if (!this._initialized) return;
    const sound = this._sounds[name];
    if (!sound) return;
    const clone = sound.cloneNode();
    clone.volume = this._sfxVolume;
    clone.play().catch(() => {});
  }

  fire() { this._play('fire'); }
  hit() { this._play('hit'); }
  explosion() { this._play('explosion'); }
  splash() { this._play('splash'); }
  dash() { this._play('dash'); }
  powerup() { this._play('powerup'); }
  shieldBreak() { this._play('shield_break'); }
  ram() { this._play('ram'); }

  toggleMusic() {
    if (!this._music) return this._musicPlaying;
    this._musicPlaying = !this._musicPlaying;
    if (this._musicPlaying) {
      this._music.play().catch(() => {});
    } else {
      this._music.pause();
    }
    return this._musicPlaying;
  }

  get musicPlaying() {
    return this._musicPlaying;
  }
}
