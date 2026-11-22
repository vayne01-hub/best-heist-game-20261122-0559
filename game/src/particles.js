// Small particles and floating score text for The Midnight Vault.
// Gold bursts when loot is taken, grey puffs when a smoke pellet pops.

export class ParticleField {
  constructor() {
    this.particles = [];
    this.floaters = [];
  }

  reset() {
    this.particles = [];
    this.floaters = [];
  }

  burstGold(x, y, count = 26) {
    for (let i = 0; i < count; i += 1) {
      const angle = (i / count) * Math.PI * 2 + 0.13 * i;
      const speed = 40 + (i % 5) * 22;
      this.particles.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 30,
        life: 0.9,
        maxLife: 0.9,
        size: 3 + (i % 3),
        color: i % 3 === 0 ? '#ffe082' : '#ffb300',
      });
    }
  }

  puffSmoke(x, y) {
    for (let i = 0; i < 18; i += 1) {
      const angle = (i / 18) * Math.PI * 2;
      this.particles.push({
        x: x + Math.cos(angle) * 12,
        y: y + Math.sin(angle) * 12,
        vx: Math.cos(angle) * 14,
        vy: Math.sin(angle) * 14,
        life: 1.4,
        maxLife: 1.4,
        size: 7 + (i % 4) * 2,
        color: '#9aa3b2',
      });
    }
  }

  floatText(x, y, text) {
    this.floaters.push({ x, y, text, life: 1.6, maxLife: 1.6 });
  }

  update(dt) {
    for (const p of this.particles) {
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += 26 * dt;
      p.life -= dt;
    }
    this.particles = this.particles.filter((p) => p.life > 0);
    for (const f of this.floaters) {
      f.y -= 26 * dt;
      f.life -= dt;
    }
    this.floaters = this.floaters.filter((f) => f.life > 0);
  }
}
