// Tiny synthesized sound effects for The Midnight Vault.
// No audio files: every blip is an oscillator through WebAudio, created on
// the first key press so the browser's autoplay rules stay happy. Sound is
// cosmetic; the game plays fully muted.

export class SoundEffects {
  constructor() {
    this.context = null;
    this.enabled = true;
  }

  unlock() {
    if (this.context) return;
    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) return;
      this.context = new AudioContext();
    } catch {
      this.context = null;
    }
  }

  tone(frequency, duration, type = 'sine', volume = 0.05) {
    if (!this.context || !this.enabled) return;
    try {
      const oscillator = this.context.createOscillator();
      const gain = this.context.createGain();
      oscillator.type = type;
      oscillator.frequency.value = frequency;
      gain.gain.setValueAtTime(volume, this.context.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.0001, this.context.currentTime + duration);
      oscillator.connect(gain);
      gain.connect(this.context.destination);
      oscillator.start();
      oscillator.stop(this.context.currentTime + duration);
    } catch {
      // Sound never blocks the game.
    }
  }

  playPickup() {
    this.tone(660, 0.09, 'triangle', 0.06);
    setTimeout(() => this.tone(990, 0.12, 'triangle', 0.06), 70);
  }

  playSpotted() {
    this.tone(180, 0.28, 'sawtooth', 0.05);
  }

  playVault() {
    this.tone(392, 0.1, 'triangle', 0.06);
    setTimeout(() => this.tone(523, 0.1, 'triangle', 0.06), 90);
    setTimeout(() => this.tone(784, 0.18, 'triangle', 0.06), 180);
  }

  playCaught() {
    this.tone(140, 0.4, 'sawtooth', 0.07);
    setTimeout(() => this.tone(90, 0.5, 'sawtooth', 0.07), 120);
  }

  playWin() {
    [523, 659, 784, 1046].forEach((frequency, i) => {
      setTimeout(() => this.tone(frequency, 0.16, 'triangle', 0.06), i * 110);
    });
  }
}
