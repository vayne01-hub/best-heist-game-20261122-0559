// The alarm meter for The Midnight Vault.
// Seen by a guard or a camera the meter climbs; hidden and quiet it drains
// slowly. A loud move near a guard or a spent smoke pellet adds a burst.
// At 100 the alarm is full: the heist is blown and the run is lost.

export class AlarmMeter {
  constructor() {
    this.value = 0;
    this.full = false;
    this.lastCause = '';
  }

  reset() {
    this.value = 0;
    this.full = false;
    this.lastCause = '';
  }

  add(amount, cause) {
    if (this.full) return;
    this.value = Math.min(100, this.value + amount);
    if (amount > 0) this.lastCause = cause;
    if (this.value >= 100) this.full = true;
  }

  drain(amount) {
    if (this.full) return;
    this.value = Math.max(0, this.value - amount);
  }

  get level() {
    return this.value / 100;
  }

  // Green while calm, amber while warm, red while hot.
  get color() {
    if (this.value < 40) return '#57c785';
    if (this.value < 75) return '#f2b544';
    return '#ef5350';
  }
}
