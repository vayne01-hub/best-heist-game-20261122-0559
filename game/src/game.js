// The game itself for The Midnight Vault: state machine, input, alarm wiring,
// loot, smoke, win/lose, deterministic screenshot presets and a scripted
// autopilot the maker uses to prove the game can be won, lost and restarted.

import { buildLevel, roomAt } from './level.js';
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
    // Loud footsteps near a guard raise the alarm a little.
    if (this.thief.moving && !this.thief.sneaking) {
      for (const guard of this.guards) {
        if (Math.hypot(guard.x - this.thief.x, guard.y - this.thief.y) < 180) {
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
    this.restart();
    if (mode === 'win') {
      // Routed through the door gaps, never straight through a wall:
      // south door out of the Entry Hall, south row across the Gallery,
      // south door into the Office, around the desk, north door to the Vault.
      this.autopilot = {
        waypoints: [
          { x: 200, y: 300 },
          { x: 180, y: 370 },
          { x: 180, y: 420 },
          { x: 320, y: 520 },
          { x: 500, y: 620 },
          { x: 860, y: 620 },
          { x: 933, y: 510 },
          { x: 1000, y: 560 },
          { x: 1090, y: 560 },
          { x: 1200, y: 560 },
          { x: 1200, y: 420 },
          { x: 1090, y: 420, gate: 'vaultClear' },
          { x: 1090, y: 350 },
          { x: 1150, y: 180 },
          { x: 1090, y: 350 },
          { x: 1090, y: 420 },
          { x: 1200, y: 420 },
          { x: 1200, y: 560 },
          { x: 1090, y: 560 },
          { x: 1000, y: 560 },
          { x: 933, y: 510 },
          { x: 860, y: 620 },
          { x: 500, y: 620 },
          { x: 320, y: 520 },
          { x: 180, y: 420 },
          { x: 180, y: 370 },
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

  runAutopilot(dt) {
    const plan = this.autopilot;
    if (!plan || this.state !== 'playing') return;
    const target = plan.waypoints[plan.index];
    if (!target) return;

    // Gate: do not enter the vault room while Mara patrols its north side.
    if (target.gate === 'vaultClear') {
      const mara = this.guards[1];
      const nearVault = Math.hypot(mara.x - 1150, mara.y - 180) < 320;
      if (nearVault && mara.y < 420) {
        this.waitInfo = `gate:mara@(${Math.round(mara.x)},${Math.round(mara.y)})`;
        this.setMoveInput(null);
        return;
      }
    }

    // Wait out a guard whose cone is turned toward the thief.
    for (const guard of this.guards) {
      const dx = this.thief.x - guard.x;
      const dy = this.thief.y - guard.y;
      const dist = Math.hypot(dx, dy);
      if (dist < 230) {
        const toThief = Math.atan2(dy, dx);
        let diff = Math.abs(toThief - guard.angle) % (Math.PI * 2);
        if (diff > Math.PI) diff = Math.PI * 2 - diff;
        if (diff < 0.9 && guard.state !== 'search') {
          this.waitInfo = `guard:${guard.name}@(${Math.round(guard.x)},${Math.round(guard.y)}) angle=${guard.angle.toFixed(2)} toThief=${toThief.toFixed(2)} diff=${diff.toFixed(2)}`;
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
    const nearGuard = this.guards.some(
      (guard) => Math.hypot(guard.x - this.thief.x, guard.y - this.thief.y) < 260,
    );
    this.input.left = dx < -4;
    this.input.right = dx > 4;
    this.input.up = dy < -4;
    this.input.down = dy > 4;
    this.input.sneak = nearGuard;
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
      waypoint: this.autopilot ? this.autopilot.index : -1,
      wait: this.waitInfo || '',
      restarted: this.restarted,
    });
  }
}
