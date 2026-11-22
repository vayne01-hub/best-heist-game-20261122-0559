// The guards for The Midnight Vault.
// Each guard walks a waypoint patrol and watches a raycast vision cone.
// Seeing the thief builds suspicion: a glance makes the guard suspicious and
// walk over to look, a long look (or a close one) makes the guard chase.
// Losing the thief for a while drops the guard back to searching, then patrol.

import { angleDifference, castVisionCone, hasLineOfSight } from './vision.js';
import { resolveCircleCollision } from './level.js';

export const GUARD_VIEW_RANGE = 245;
export const GUARD_VIEW_FOV = 1.35; // about 77 degrees
export const GUARD_SNEAK_RANGE = 150;

export class Guard {
  constructor(route) {
    this.name = route.name;
    this.waypoints = route.waypoints;
    this.speed = route.speed;
    this.waypointIndex = 0;
    this.x = route.waypoints[0].x;
    this.y = route.waypoints[0].y;
    this.radius = 14;
    this.angle = 0;
    this.state = 'patrol'; // patrol | suspicious | search | chase
    this.suspicion = 0;
    this.lastSeen = null;
    this.loseSightTimer = 0;
    this.lookTimer = 0;
    this.lookDirection = 0;
    this.cone = [];
  }

  reset() {
    this.waypointIndex = 0;
    this.x = this.waypoints[0].x;
    this.y = this.waypoints[0].y;
    this.angle = 0;
    this.state = 'patrol';
    this.suspicion = 0;
    this.lastSeen = null;
    this.loseSightTimer = 0;
    this.lookTimer = 0;
    this.cone = [];
  }

  canSeeThief(thief, solids, smokes) {
    const range = thief.sneaking ? GUARD_SNEAK_RANGE : GUARD_VIEW_RANGE;
    const dx = thief.x - this.x;
    const dy = thief.y - this.y;
    const dist = Math.hypot(dx, dy);
    if (dist > range) return false;
    const toThief = Math.atan2(dy, dx);
    if (Math.abs(angleDifference(toThief, this.angle)) > GUARD_VIEW_FOV / 2) return false;
    return hasLineOfSight(this.x, this.y, thief.x, thief.y, solids, smokes);
  }

  update(dt, thief, solids, smokes) {
    const sees = this.canSeeThief(thief, solids, smokes);
    if (sees) {
      const dist = Math.hypot(thief.x - this.x, thief.y - this.y);
      const closeness = 1 - dist / GUARD_VIEW_RANGE;
      this.suspicion = Math.min(1, this.suspicion + dt * (0.55 + closeness * 0.9));
      this.lastSeen = { x: thief.x, y: thief.y };
      this.loseSightTimer = 0;
      if (this.suspicion >= 1 || dist < 70) {
        if (this.state !== 'chase') this.state = 'chase';
      } else if (this.suspicion > 0.35 && this.state === 'patrol') {
        this.state = 'suspicious';
      }
    } else {
      this.suspicion = Math.max(0, this.suspicion - dt * 0.25);
      this.loseSightTimer += dt;
      if (this.state === 'chase' && this.loseSightTimer > 3) {
        this.state = 'search';
        this.lookTimer = 0;
      }
      if (this.state === 'suspicious' && this.loseSightTimer > 1.2) {
        this.state = 'search';
        this.lookTimer = 0;
      }
    }

    if (this.state === 'patrol') {
      this.walkToward(this.waypoints[this.waypointIndex], this.speed, dt, solids);
      const target = this.waypoints[this.waypointIndex];
      if (Math.hypot(target.x - this.x, target.y - this.y) < 10) {
        this.waypointIndex = (this.waypointIndex + 1) % this.waypoints.length;
      }
    } else if (this.state === 'suspicious' || this.state === 'chase') {
      const target = this.state === 'chase' ? { x: thief.x, y: thief.y } : this.lastSeen;
      if (target) {
        const speed = this.state === 'chase' ? 108 : 78;
        this.walkToward(target, speed, dt, solids);
        if (this.state === 'suspicious' && Math.hypot(target.x - this.x, target.y - this.y) < 14) {
          this.state = 'search';
          this.lookTimer = 0;
        }
      }
    } else if (this.state === 'search') {
      this.lookTimer += dt;
      this.angle = this.lookDirection + Math.sin(this.lookTimer * 1.6) * 1.1;
      if (this.lookTimer > 2.6) {
        this.state = 'patrol';
        this.lookDirection = this.angle;
      }
    }

    this.cone = castVisionCone(this.x, this.y, this.angle, GUARD_VIEW_FOV, GUARD_VIEW_RANGE, solids);
  }

  walkToward(target, speed, dt, solids) {
    const dx = target.x - this.x;
    const dy = target.y - this.y;
    const dist = Math.hypot(dx, dy);
    if (dist < 1) return;
    this.angle = Math.atan2(dy, dx);
    this.x += (dx / dist) * speed * dt;
    this.y += (dy / dist) * speed * dt;
    resolveCircleCollision(this, solids);
  }

  touchesThief(thief) {
    return Math.hypot(thief.x - this.x, thief.y - this.y) < this.radius + thief.radius + 2;
  }
}
