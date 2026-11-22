// The security cameras for The Midnight Vault.
// Each camera is bolted to a wall and sweeps its own raycast cone back and
// forth. A camera never chases, but being caught in its cone drives the
// alarm up fast, and its sweep is a timing puzzle: cross while it looks away.

import { angleDifference, castVisionCone, hasLineOfSight } from './vision.js';

export class SecurityCamera {
  constructor(spec) {
    this.id = spec.id;
    this.x = spec.x;
    this.y = spec.y;
    this.baseAngle = spec.baseAngle;
    this.sweep = spec.sweep;
    this.sweepSpeed = spec.sweepSpeed;
    this.range = spec.range;
    this.fov = spec.fov;
    this.time = 0;
    this.angle = spec.baseAngle;
    this.alert = false;
    this.cone = [];
  }

  reset() {
    this.time = 0;
    this.angle = this.baseAngle;
    this.alert = false;
    this.cone = [];
  }

  update(dt, thief, solids, smokes) {
    this.time += dt;
    this.angle = this.baseAngle + Math.sin(this.time * this.sweepSpeed) * this.sweep;
    this.cone = castVisionCone(this.x, this.y, this.angle, this.fov, this.range, solids);
    const dx = thief.x - this.x;
    const dy = thief.y - this.y;
    const dist = Math.hypot(dx, dy);
    const inRange = dist <= this.range;
    const inAngle = Math.abs(angleDifference(Math.atan2(dy, dx), this.angle)) <= this.fov / 2;
    this.alert = inRange && inAngle && hasLineOfSight(this.x, this.y, thief.x, thief.y, solids, smokes);
  }
}
