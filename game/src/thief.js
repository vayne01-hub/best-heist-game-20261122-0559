// The thief for The Midnight Vault.
// Eight-way movement, a sneak that is slower and quieter, a hold-to-crack
// channel for the vault, and a smoke pellet that costs alarm to throw.

import { resolveCircleCollision } from './level.js';

export const WALK_SPEED = 150;
export const SNEAK_SPEED = 72;

export class Thief {
  constructor(spawn) {
    this.x = spawn.x;
    this.y = spawn.y;
    this.radius = 13;
    this.angle = 0;
    this.sneaking = false;
    this.moving = false;
    this.noiseRadius = 180;
    this.smokeCharges = 2;
    this.channel = null; // { loot, progress } while cracking the vault
    this.channelProgress = 0;
  }

  reset(spawn) {
    this.x = spawn.x;
    this.y = spawn.y;
    this.angle = 0;
    this.sneaking = false;
    this.moving = false;
    this.smokeCharges = 2;
    this.channel = null;
    this.channelProgress = 0;
  }

  update(dt, input, solids) {
    let mx = 0;
    let my = 0;
    if (input.left) mx -= 1;
    if (input.right) mx += 1;
    if (input.up) my -= 1;
    if (input.down) my += 1;
    if (input.clickTarget) {
      const dx = input.clickTarget.x - this.x;
      const dy = input.clickTarget.y - this.y;
      const dist = Math.hypot(dx, dy);
      if (dist > 8) {
        mx = dx / dist;
        my = dy / dist;
      } else {
        input.clickTarget = null;
      }
    }
    const length = Math.hypot(mx, my);
    this.moving = length > 0;
    if (this.moving) {
      const speed = input.sneak ? SNEAK_SPEED : WALK_SPEED;
      this.x += (mx / length) * speed * dt;
      this.y += (my / length) * speed * dt;
      this.angle = Math.atan2(my, mx);
    }
    this.sneaking = Boolean(input.sneak) && this.moving;
    resolveCircleCollision(this, solids);
    this.x = Math.max(20, Math.min(1260, this.x));
    this.y = Math.max(76, Math.min(700, this.y));
  }

  nearestLoot(level, maxDistance = 52) {
    let best = null;
    let bestDist = maxDistance;
    for (const item of level.loot) {
      if (item.taken) continue;
      const dist = Math.hypot(item.x - this.x, item.y - this.y);
      if (dist < bestDist) {
        best = item;
        bestDist = dist;
      }
    }
    return best;
  }
}
