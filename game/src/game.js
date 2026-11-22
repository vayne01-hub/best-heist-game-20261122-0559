// The game itself for The Midnight Vault: state machine, input, alarm wiring,
// loot, smoke, win/lose, deterministic screenshot presets and a scripted
// autopilot the maker uses to prove the game can be won, lost and restarted.

import { buildLevel, roomAt } from './level.js';
import { hasLineOfSight } from './vision.js';
import { Thief } from './thief.js';
import { Guard } from './guard.js';
import { SecurityCamera } from './camera.js';
import { AlarmMeter } from './alarm.js';
import { ParticleField } from './particles.js';
import { SoundEffects } from './audio.js';

const TOTAL_LOOT_VALUE = 69000;

export class Game {
  constructor() {
    this.level = buildLevel();
    this.thief = new Thief(this.level.spawn);
    this.guards = this.level.guardRoutes.map((route) => new Guard(route));
    this.cameras = this.level.cameras.map((spec) => new SecurityCamera(spec));
    this.alarm = new AlarmMeter();
    this.particles = new ParticleField();
    this.sounds = new SoundEffects();
    this.input = { left: false, right: false, up: false, down: false, sneak: false, interact: false, clickTarget: null };
    this.state = 'title'; // title | playing | won | lost
    this.time = 0;
    this.lootValue = 0;
    this.lootTaken = 0;
    this.smokes = [];
    this.spottedFlash = 0;
    this.loseReason = '';
    this.errors = [];
    this.testMode = null;
    this.testDone = false;
    this.testOutcome = null;
    this.waitInfo = null;
    this.fleeIndex = null;
    this.hiding = false;
    this.hideMode = null;
    this.hideResumeIndex = null;
    this.restarted = false;
    this.autopilot = null;
    this.shotMode = false;
  }

  get vaultTaken() {
    const vault = this.level.loot.find((item) => item.kind === 'vault');
    return Boolean(vault && vault.taken);
  }

  get timerText() {
    const total = Math.floor(this.time);
    const minutes = Math.floor(total / 60);
    const seconds = total % 60;
    return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  }

  get roomName() {
    const room = roomAt(this.level, this.thief.x, this.thief.y);
    return room ? room.name : 'THE MANSION';
  }

  start() {
    this.state = 'playing';
  }

  restart() {
    this.level = buildLevel();
    this.thief.reset(this.level.spawn);
    for (const guard of this.guards) guard.reset();
    for (const camera of this.cameras) camera.reset();
    this.alarm.reset();
    this.particles.reset();
    this.smokes = [];
    this.spottedFlash = 0;
    this.loseReason = '';
    this.time = 0;
    this.lootValue = 0;
    this.lootTaken = 0;
    this.state = 'playing';
    this.autopilot = null;
    this.restarted = true;
  }

  throwSmoke() {
    if (this.thief.smokeCharges <= 0 || this.state !== 'playing') return;
    this.thief.smokeCharges -= 1;
    this.smokes.push({ x: this.thief.x, y: this.thief.y, radius: 90, ttl: 4 });
    this.particles.puffSmoke(this.thief.x, this.thief.y);
    this.alarm.add(5, 'smoke pellet');
  }

  takeLoot(item) {
    item.taken = true;
    this.lootValue += item.value;
    this.lootTaken += 1;
    this.particles.burstGold(item.x, item.y, item.kind === 'vault' ? 40 : 22);
    this.particles.floatText(item.x, item.y - 30, `+$${item.value.toLocaleString('en-US')}`);
    if (item.kind === 'vault') this.sounds.playVault();
    else this.sounds.playPickup();
  }

  update(dt) {
    if (this.state !== 'playing') return;
    this.time += dt;
    this.spottedFlash = Math.max(0, this.spottedFlash - dt);

    for (const smoke of this.smokes) smoke.ttl -= dt;
    this.smokes = this.smokes.filter((smoke) => smoke.ttl > 0);

    this.thief.update(dt, this.input, this.level.solids);

    // Loot interaction: small loot is instant, the vault needs a held channel.
    const loot = this.thief.nearestLoot(this.level);
    if (loot && this.input.interact) {
      if (loot.channelSeconds > 0) {
        this.thief.channel = loot;
        this.thief.channelProgress += dt;
        if (this.thief.channelProgress >= loot.channelSeconds) {
          this.thief.channel = null;
          this.thief.channelProgress = 0;
          this.takeLoot(loot);
        }
      } else {
        this.takeLoot(loot);
      }
    } else {
      this.thief.channel = null;
      this.thief.channelProgress = 0;
    }

    let seenByGuard = false;
    let seenByCamera = false;
    for (const guard of this.guards) {
      guard.update(dt, this.thief, this.level.solids, this.smokes);
      if (guard.canSeeThief(this.thief, this.level.solids, this.smokes)) seenByGuard = true;
      if (guard.state === 'chase' && this.spottedFlash <= 0) {
        this.spottedFlash = 1.4;
        this.sounds.playSpotted();
      }
      if (guard.touchesThief(this.thief)) {
        this.lose('caught');
        return;
      }
    }
    for (const camera of this.cameras) {
      camera.update(dt, this.thief, this.level.solids, this.smokes);
      if (camera.alert) seenByCamera = true;
    }

    if (seenByGuard) this.alarm.add(16 * dt, 'guard sight');
    if (seenByCamera) this.alarm.add(24 * dt, 'camera sight');
    if (!seenByGuard && !seenByCamera) this.alarm.drain(3 * dt);
    // Loud footsteps near a guard raise the alarm a little, but only
    // when the guard has a clear line to the thief: footsteps through a
    // solid wall are not heard, and a wall-wedged guard used to keep the
    // meter climbing while the thief stood on the far side of it.
    if (this.thief.moving && !this.thief.sneaking) {
      for (const guard of this.guards) {
        if (
          Math.hypot(guard.x - this.thief.x, guard.y - this.thief.y) < 180 &&
          hasLineOfSight(guard.x, guard.y, this.thief.x, this.thief.y, this.level.solids, this.smokes)
        ) {
          this.alarm.add(4 * dt, 'footsteps');
          break;
        }
      }
    }
    if (this.alarm.full) {
      this.lose('alarm');
      return;
    }

    const zone = this.level.exitZone;
    const inExit =
      this.thief.x >= zone.x && this.thief.x <= zone.x + zone.w + 26 &&
      this.thief.y >= zone.y && this.thief.y <= zone.y + zone.h;
    if (this.vaultTaken && inExit) {
      this.state = 'won';
      this.sounds.playWin();
      if (this.testMode) this.finishTest();
      return;
    }

    this.particles.update(dt);
    if (this.testMode) this.runAutopilot(dt);
  }

  lose(reason) {
    this.state = 'lost';
    this.loseReason = reason;
    this.sounds.playCaught();
    if (this.testMode) this.finishTest();
  }

  // ---- Deterministic screenshot presets ---------------------------------
  // Each preset places every actor at fixed coordinates and freezes the
  // simulation, so the same URL always renders the same frame.

  applyShot(name) {
    this.shotMode = true;
    this.restart();
    this.state = 'playing';
    const vault = this.level.loot.find((item) => item.kind === 'vault');
    const painting = this.level.loot.find((item) => item.kind === 'painting');
    const vase = this.level.loot.find((item) => item.kind === 'vase');
    const guard1 = this.guards[0];
    const guard2 = this.guards[1];
    const cam1 = this.cameras[0];
    const cam2 = this.cameras[1];

    if (name === 'cover') {
      this.time = 72;
      this.alarm.value = 55;
      painting.taken = true;
      this.lootValue = 8000;
      this.lootTaken = 1;
      this.thief.x = 560;
      this.thief.y = 420;
      this.thief.angle = 0.35;
      guard1.x = 700;
      guard1.y = 330;
      guard1.angle = Math.atan2(420 - 330, 560 - 700);
      guard1.state = 'suspicious';
      guard1.suspicion = 0.5;
      guard1.lastSeen = { x: 560, y: 420 };
      guard2.x = 1000;
      guard2.y = 150;
      guard2.angle = Math.PI;
      cam1.time = 1.72; // cone sweeps down-left across the gallery
      cam2.time = -0.97; // cone sweeps down-left across the vault room
    } else if (name === 'alert') {
      this.time = 95;
      this.alarm.value = 82;
      painting.taken = true;
      vase.taken = true;
      this.lootValue = 13000;
      this.lootTaken = 2;
      this.thief.x = 820;
      this.thief.y = 300;
      this.thief.angle = 0.5;
      this.spottedFlash = 1.0;
      guard2.x = 900;
      guard2.y = 280;
      guard2.angle = Math.atan2(300 - 280, 820 - 900);
      guard2.state = 'chase';
      guard2.suspicion = 1;
      guard2.lastSeen = { x: 820, y: 300 };
      guard1.x = 500;
      guard1.y = 200;
      guard1.angle = 0;
      guard1.state = 'suspicious';
      guard1.suspicion = 0.6;
      cam1.time = 0.4;
      cam2.time = 2.2;
    } else if (name === 'loot') {
      this.time = 150;
      this.alarm.value = 30;
      painting.taken = true;
      vase.taken = true;
      vault.taken = true;
      this.lootValue = 63000;
      this.lootTaken = 3;
      this.thief.x = 1150;
      this.thief.y = 185;
      this.thief.angle = -Math.PI / 2;
      this.particles.burstGold(vault.x, vault.y, 40);
      this.particles.floatText(vault.x, vault.y - 60, '+$50,000');
      guard1.x = 430;
      guard1.y = 600;
      guard1.angle = Math.PI;
      guard2.x = 1000;
      guard2.y = 620;
      guard2.angle = 0;
      cam1.time = 3.4;
      cam2.time = 1.1;
    } else if (name === 'end') {
      this.time = 187;
      this.alarm.value = 41;
      for (const item of this.level.loot) item.taken = true;
      this.lootValue = TOTAL_LOOT_VALUE;
      this.lootTaken = 4;
      this.thief.x = 40;
      this.thief.y = 300;
      this.state = 'won';
      guard1.x = 860;
      guard1.y = 200;
      guard1.angle = Math.PI;
      guard2.x = 980;
      guard2.y = 620;
      guard2.angle = -Math.PI / 2;
      cam1.time = 1.0;
      cam2.time = 0.5;
    }

    // One zero-step update renders every cone at the preset pose.
    for (const guard of this.guards) guard.update(0, this.thief, this.level.solids, this.smokes);
    for (const camera of this.cameras) camera.update(0, this.thief, this.level.solids, this.smokes);
  }

  // ---- Scripted play-test driver -----------------------------------------
  // test=win walks the thief to the vault and out again; test=lose walks
  // into a guard. The probe element reports the outcome for headless runs.

  beginTest(mode) {
    this.testMode = mode;
    this.smokeUsedAtVault = false;
    this.fleeIndex = null;
    this.hiding = false;
    this.hideMode = null;
    this.hideResumeIndex = null;
    this._stallTime = 0;
    this._stallSidestep = 0;
    this._stallLast = null;
    this.restart();
    if (mode === 'win') {
      // Routed through the door gaps, never straight through a wall.
      // The vault is reached through the EAST NORTH door (y 200..260),
      // not the office south door: the north route crosses the gallery
      // 30px south of Rocco's north leg, where his cone never points,
      // and slips into the vault room while Mara is south in the
      // office, so the thief never has to time her south row or cross
      // Rocco's south leg at all. The south door and its gates were a
      // trap: Mara saw the thief waiting at the office corner, and the
      // flee west along the south row rear-ended Rocco's patrol.
      this.autopilot = {
        waypoints: [
          { x: 200, y: 300 },
          { x: 200, y: 210 },
          { x: 400, y: 210 },
          // Across the gallery at y 400, not y 230: cam 1 (640, 76,
          // range 270) watches the whole north strip, and the thief
          // crossing at y 230 collected +30 alarm from it alone. At
          // y 400 the thief is out of cam 1's range and south of
          // Rocco's north leg, where his cone never points. (y 350
          // looked right too, but it runs straight into the statue at
          // (600, 330, 46, 46): the thief pushed east into its west
          // face with no vertical input and stalled there for the whole
          // run. y 400 passes 24px south of the statue, clear.)
          { x: 400, y: 400 },
          { x: 900, y: 400 },
          { x: 900, y: 230 },
          { x: 928, y: 230 },
          { x: 1000, y: 230 },
          { x: 1150, y: 180, vault: true },
          { x: 1000, y: 230 },
          { x: 928, y: 230 },
          { x: 900, y: 230 },
          { x: 900, y: 400 },
          { x: 400, y: 400 },
          { x: 400, y: 210 },
          { x: 200, y: 210 },
          { x: 200, y: 300 },
          { x: 32, y: 300 },
        ],
        index: 0,
      };
    } else if (mode === 'lose') {
      const guard = this.guards[0];
      this.thief.x = guard.x + Math.cos(guard.angle) * 40;
      this.thief.y = guard.y + Math.sin(guard.angle) * 40;
      this.alarm.value = 50;
      this.autopilot = { waypoints: [{ x: guard.x + 120, y: guard.y }], index: 0 };
    }
  }

  // True when a point (with the thief's 13px radius) would be inside a
  // solid: used by the stall detector to pick an open sidestep direction.
  _pointBlocked(x, y) {
    const r = 13;
    for (const s of this.level.solids) {
      if (x > s.x - r && x < s.x + s.w + r && y > s.y - r && y < s.y + s.h + r) {
        return true;
      }
    }
    return false;
  }

  runAutopilot(dt) {
    const plan = this.autopilot;
    if (!plan || this.state !== 'playing') return;
    const target = plan.waypoints[plan.index];
    if (!target) return;

    // Stall detector: if the thief has a movement input but has not moved
    // for 1.5s, it is wedged against furniture (a waypoint leg that runs
    // head-on into a solid with no sliding component, so it never slides
    // around it). Sidestep perpendicular to the route for 1.2s to walk
    // around the obstacle, then resume the route.
    if (this._stallSidestep > 0) {
      this._stallSidestep -= dt;
      const dx = target.x - this.thief.x;
      const dy = target.y - this.thief.y;
      const dist = Math.hypot(dx, dy) || 1;
      let px = -dy / dist;
      let py = dx / dist;
      if (this._pointBlocked(this.thief.x + px * 40, this.thief.y + py * 40)) {
        px = -px;
        py = -py;
      }
      this.input.left = px < -0.3;
      this.input.right = px > 0.3;
      this.input.up = py < -0.3;
      this.input.down = py > 0.3;
      this.input.sneak = false;
      this.input.interact = false;
      this.input.clickTarget = null;
      this.waitInfo = 'unstick';
      return;
    }
    const moved = this._stallLast
      ? Math.hypot(this.thief.x - this._stallLast.x, this.thief.y - this._stallLast.y)
      : 1;
    const hadMoveInput =
      this.input.left || this.input.right || this.input.up || this.input.down;
    if (moved < 1 && hadMoveInput) {
      this._stallTime = (this._stallTime || 0) + dt;
      if (this._stallTime > 1.5) {
        this._stallSidestep = 1.2;
        this._stallTime = 0;
      }
    } else {
      this._stallTime = 0;
    }
    this._stallLast = { x: this.thief.x, y: this.thief.y };

    // Threat response comes FIRST: never wait at a gate or stand cracking
    // the vault while a guard is on the thief. (Smoke hides the thief, so
    // a guard whose line of sight crosses a cloud is no threat at all:
    // hasLineOfSight below already accounts for smoke.)
    let threat = null;
    for (const guard of this.guards) {
      const dx = this.thief.x - guard.x;
      const dy = this.thief.y - guard.y;
      const dist = Math.hypot(dx, dy);
      const toThief = Math.atan2(dy, dx);
      let diff = Math.abs(toThief - guard.angle) % (Math.PI * 2);
      if (diff > Math.PI) diff = Math.PI * 2 - diff;
      const sees = guard.canSeeThief(this.thief, this.level.solids, this.smokes);
      // Line of sight matters: a guard on the far side of a wall is no
      // threat, and fleeing from one runs the thief into the real danger.
      const clearShot = hasLineOfSight(guard.x, guard.y, this.thief.x, this.thief.y, this.level.solids, this.smokes);
      // Proximity only counts at very close range, and only when the
      // guard is actually facing the thief: a guard 150px away facing
      // the thief's general direction cannot see it (outside the vision
      // cone) and is no threat, yet fleeing from it ran the thief
      // straight into the guard's path along the office south row. A
      // guard walking past 20px away, facing away, is no threat either:
      // the old unconditional close-range clause fled from those too.
      if (sees || (clearShot && dist < 60 && diff < 1.0)) {
        threat = guard;
        break;
      }
    }
    if (threat && this.fleeIndex === null && !this.hiding) {
      // Fall back one route step at a time, toward the waypoint behind
      // the one the thief is heading for: consecutive waypoints are
      // valid route segments, so the flee path never runs into a wall.
      // (Retargeting two steps at once wedged the thief on the office
      // wall, whose door gap the straight line missed.)
      this.fleeIndex = Math.max(0, plan.index - 1);
    }
    // Hiding: the thief ran to the spawn (48, 300), deep in the
    // Storage where the west divider wall breaks every guard's line of
    // sight. A chase-hide ends when the threat clears and the route
    // resumes from waypoint 1. A Rocco-hide ends when Rocco has left the
    // gallery south leg, and the route resumes from waypoint 3 (the
    // Storage door), the only safe way back onto the gallery south row.
    if (this.hiding) {
      // The hide is the spawn (48, 300), but a thief east of
      // the west divider must cross that wall through its south door gap
      // first: a beeline to the hide from the gallery side runs straight
      // into the wall's south segment and stalls there, in Rocco's cone.
      // So the hide is two steps: the Storage door waypoint (320, 520)
      // while east of the wall, then the hide itself once through it.
      // Once through the wall the beeline to the spawn is clear, so the
      // beeline to it always has a southward component and slides around
      // them instead of stalling against one's east face.
      const hide = this.thief.x > 362 ? { x: 320, y: 520 } : { x: 48, y: 300 };
      const hdx = hide.x - this.thief.x;
      const hdy = hide.y - this.thief.y;
      const hideDone =
        this.hideMode === 'rocco' ? this.guards[0].y < 500 && !threat : !threat;
      // Only rest once actually at the hide, west of the wall: the
      // intermediate step (320, 520) is visible to Rocco through the
      // west door gap, so the thief must not linger there.
      const atHide = this.thief.x <= 362 && Math.hypot(hdx, hdy) < 14;
      if (hideDone) {
        this.hiding = false;
        this.fleeIndex = null;
        plan.index = this.hideResumeIndex;
        this.hideResumeIndex = null;
        this.hideMode = null;
      } else if (atHide) {
        this.setMoveInput(null);
        this.waitInfo = `hide:${threat ? threat.name : this.hideMode}`;
        return;
      } else {
        this.input.left = hdx < -4;
        this.input.right = hdx > 4;
        this.input.up = hdy < -4;
        this.input.down = hdy > 4;
        this.input.sneak = false;
        this.input.interact = false;
        this.input.clickTarget = null;
        this.waitInfo = `hide:${threat ? threat.name : this.hideMode}`;
        return;
      }
    }
    if (this.fleeIndex !== null) {
      const fleePoint = plan.waypoints[this.fleeIndex];
      const fdx = fleePoint.x - this.thief.x;
      const fdy = fleePoint.y - this.thief.y;
      if (Math.hypot(fdx, fdy) < 8) {
        if (threat && this.fleeIndex > 0) {
          // Still hunted on arrival: fall one more route step back.
          this.fleeIndex -= 1;
        } else if (threat) {
          // Backed all the way to the first waypoint with a guard still
          // chasing: do not stand still in the Entry Hall, the chasing
          // guard follows the thief out of its patrol and catches it
          // there. Run to the spawn instead, where the west divider wall
          // breaks the guard's line of sight and it gives up the chase
          // within a few seconds.
          this.hiding = true;
          this.hideMode = 'flee';
          this.hideResumeIndex = 1;
        } else {
          // Safe: resume the route forward from the waypoint reached.
          plan.index = this.fleeIndex + 1;
          this.fleeIndex = null;
        }
      }
      if (this.fleeIndex !== null) {
        this.input.left = fdx < -4;
        this.input.right = fdx > 4;
        this.input.up = fdy < -4;
        this.input.down = fdy > 4;
        this.input.sneak = false;
        this.input.interact = false;
        this.input.clickTarget = null;
        this.waitInfo = `flee:${threat ? threat.name : '?'}`;
        return;
      }
    }

    // Climb gate: do not climb the east side (900, 400) -> (900, 230)
    // while Rocco is at the top of his east leg (x > 840, y < 400). He
    // walks south down that leg facing south, and his cone covers the
    // whole climb: a thief at (900, 300) is south-east of him, in the
    // cone, and the chase that follows runs the thief down in the open
    // gallery (it fled west along y 400 and Rocco chased it in a
    // straight line, alarm 18 -> 91). Wait at (900, 400) until he is
    // south of the climb start (y > 400, where the thief is north of
    // him and out of his south-facing cone) or off the east leg.
    if (plan.index === 5 && Math.hypot(this.thief.x - 900, this.thief.y - 400) < 30) {
      const rocco = this.guards[0];
      if (rocco.x > 840 && rocco.y < 400) {
        this.waitInfo = 'climb:rocco';
        this.setMoveInput(null);
        return;
      }
    }

    // North-door gate: do not step through the east divider's north door
    // into the vault room while Mara is north. The thief waits at
    // (900, 230) in the gallery, behind the wall from her and 30px south
    // of Rocco's north leg (his cone never points there), until she is
    // south in the office (y > 400). She then needs ~8s to walk back
    // north to the vault, and the thief is in and out in ~4.5s.
    if (plan.index === 5 && Math.hypot(this.thief.x - 900, this.thief.y - 230) < 30) {
      const mara = this.guards[1];
      if (mara.y <= 400) {
        this.waitInfo = 'northdoor:mara';
        this.setMoveInput(null);
        return;
      }
    }

    // No hold at the office south-east corner: the vault run is timed
    // at the door (Mara walking east along the south row, see the door
    // gates above), so by the time the thief reaches here she is already
    // turning north and the thief climbs straight to the vault. Waiting
    // here for her to come south put the thief in her cone as she
    // walked south past it.

    // Stand still on the vault until it is cracked: advancing the waypoint
    // early would walk away mid-channel and the crack would never finish.
    // The thief must be within the loot's own 52px grab range of the
    // vault itself (1180, 150), not merely near the route waypoint: the
    // waypoint is 42px from the vault, so stopping 50px short of it left
    // the thief 85px from the vault, out of range, and it stood there
    // holding interact forever while the alarm climbed.
    if (target.vault && !this.vaultTaken && Math.hypot(this.thief.x - 1180, this.thief.y - 150) < 48) {
      // Always throw smoke before cracking: the cloud hides the thief
      // from Mara and from cam 2 (bolted 110px east of the vault) for
      // the whole 1.5s channel, so the crack itself never gets seen.
      if (this.thief.smokeCharges > 0 && !this.smokeUsedAtVault) {
        this.throwSmoke();
        this.smokeUsedAtVault = true;
      }
      this.setMoveInput(null);
      this.input.interact = true;
      this.waitInfo = 'cracking';
      return;
    }

    // Wait out a guard whose cone is turned toward the thief, but only
    // while the thief is unseen and the guard has a clear line to it:
    // waiting out a guard on the far side of a wall wastes the run.
    for (const guard of this.guards) {
      const dx = this.thief.x - guard.x;
      const dy = this.thief.y - guard.y;
      const dist = Math.hypot(dx, dy);
      if (dist < 230 && hasLineOfSight(guard.x, guard.y, this.thief.x, this.thief.y, this.level.solids, this.smokes)) {
        const toThief = Math.atan2(dy, dx);
        let diff = Math.abs(toThief - guard.angle) % (Math.PI * 2);
        if (diff > Math.PI) diff = Math.PI * 2 - diff;
        if (diff < 0.9 && guard.state !== 'search' && !guard.canSeeThief(this.thief, this.level.solids, this.smokes)) {
          this.waitInfo = `wait:${guard.name}`;
          this.setMoveInput(null);
          return;
        }
      }
    }
    this.waitInfo = null;

    const dx = target.x - this.thief.x;
    const dy = target.y - this.thief.y;
    const dist = Math.hypot(dx, dy);
    if (dist < 14) {
      plan.index += 1;
      this.setMoveInput(null);
      return;
    }
    // Do not rear-end a patrolling guard: the thief (150) is faster
    // than a guard (55), so walking straight at one from behind runs
    // into its back and gets the thief caught. If a guard is just ahead
    // on the thief's line of travel, sidestep perpendicular to the
    // route, away from the guard, and pass it at a safe distance.
    // (A guard facing the thief is already handled above: the threat
    // check flees from it.)
    if (dist > 1) {
      const tAngle = Math.atan2(dy, dx);
      for (const guard of this.guards) {
        const gdx = guard.x - this.thief.x;
        const gdy = guard.y - this.thief.y;
        const gdist = Math.hypot(gdx, gdy);
        if (gdist < 90) {
          let aDiff = Math.abs(Math.atan2(gdy, gdx) - tAngle) % (Math.PI * 2);
          if (aDiff > Math.PI) aDiff = Math.PI * 2 - aDiff;
          if (aDiff < 0.7) {
            // Perpendicular to the route, away from the guard.
            let px = -dy / dist;
            let py = dx / dist;
            if (px * gdx + py * gdy > 0) {
              px = -px;
              py = -py;
            }
            this.input.left = px < -0.3;
            this.input.right = px > 0.3;
            this.input.up = py < -0.3;
            this.input.down = py > 0.3;
            this.input.sneak = false;
            this.input.interact = false;
            this.input.clickTarget = null;
            this.waitInfo = `sidestep:${guard.name}`;
            return;
          }
        }
      }
    }
    // The driver walks everywhere: it outruns a chasing guard (150 vs 108)
    // and the vault round trip fits inside Mara's return north. Sneaking
    // (72) is slower and the vault run is a timing window, so the driver
    // walks the whole route and relies on the door gates for safety.
    this.input.left = dx < -4;
    this.input.right = dx > 4;
    this.input.up = dy < -4;
    this.input.down = dy > 4;
    this.input.sneak = false;
    this.input.interact = Boolean(this.thief.nearestLoot(this.level));
    this.input.clickTarget = null;
  }

  setMoveInput() {
    this.input.left = false;
    this.input.right = false;
    this.input.up = false;
    this.input.down = false;
    this.input.interact = Boolean(this.thief.nearestLoot(this.level));
  }

  finishTest() {
    this.testOutcome = this.state;
    this.testDone = true;
    // Prove restart works: reset to a fresh playing run and report it.
    this.restart();
    this.testMode = null;
    this.autopilot = null;
  }

  writeProbe() {
    const probe = document.getElementById('probe');
    if (!probe) return;
    probe.textContent = JSON.stringify({
      state: this.state,
      alarm: Math.round(this.alarm.value),
      lootValue: this.lootValue,
      lootTaken: this.lootTaken,
      time: Math.round(this.time * 10) / 10,
      thief: { x: Math.round(this.thief.x), y: Math.round(this.thief.y) },
      guards: this.guards.map((g) => ({ name: g.name, state: g.state, x: Math.round(g.x), y: Math.round(g.y) })),
      cameras: this.cameras.map((c) => ({ id: c.id, alert: c.alert })),
      errors: this.errors,
      test: this.testMode,
      testDone: this.testDone,
      testOutcome: this.testOutcome,
      loseReason: this.loseReason,
      fleeIndex: this.fleeIndex,
      waypoint: this.autopilot ? this.autopilot.index : -1,
      wait: this.waitInfo || '',
      restarted: this.restarted,
    });
  }
}
