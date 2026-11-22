// Bootstrap for The Midnight Vault.
// Reads the URL: ?shot=cover|alert|loot|end renders one frozen deterministic
// scene for screenshots; ?test=win|lose runs the scripted play-test driver;
// no parameter starts the title screen for a human player.

import { Game } from './game.js';
import { drawGame } from './render.js';
import { STAGE_WIDTH, STAGE_HEIGHT } from './level.js';

const canvas = document.getElementById('game');
canvas.width = STAGE_WIDTH;
canvas.height = STAGE_HEIGHT;
const ctx = canvas.getContext('2d');

const game = new Game();
window.__heistGame = game;

window.addEventListener('error', (event) => {
  game.errors.push(String(event.message || event.error || 'unknown error'));
});

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const test = params.get('test');

const KEYMAP = {
  ArrowLeft: 'left',
  KeyA: 'left',
  ArrowRight: 'right',
  KeyD: 'right',
  ArrowUp: 'up',
  KeyW: 'up',
  ArrowDown: 'down',
  KeyS: 'down',
  ShiftLeft: 'sneak',
  ShiftRight: 'sneak',
  KeyE: 'interact',
};

window.addEventListener('keydown', (event) => {
  game.sounds.unlock();
  const field = KEYMAP[event.code];
  if (field) {
    game.input[field] = true;
    event.preventDefault();
    return;
  }
  if (event.code === 'KeyQ') {
    game.throwSmoke();
    event.preventDefault();
  } else if (event.code === 'KeyR') {
    game.restart();
    event.preventDefault();
  } else if (event.code === 'KeyP') {
    // Photo mode: download the canvas as a PNG, named after the shot preset.
    const names = { cover: '01-cover.png', alert: '02-alert.png', loot: '03-loot.png', end: '04-end.png' };
    const filename = names[shot] || 'heist-shot.png';
    canvas.toBlob((blob) => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
    }, 'image/png');
    event.preventDefault();
  } else if (event.code === 'Enter') {
    if (game.state === 'title') game.start();
    event.preventDefault();
  }
});

window.addEventListener('keyup', (event) => {
  const field = KEYMAP[event.code];
  if (field) game.input[field] = false;
});

canvas.addEventListener('click', (event) => {
  const rect = canvas.getBoundingClientRect();
  game.input.clickTarget = {
    x: ((event.clientX - rect.left) / rect.width) * STAGE_WIDTH,
    y: ((event.clientY - rect.top) / rect.height) * STAGE_HEIGHT,
  };
});

if (shot) {
  game.applyShot(shot);
  // Frozen frame: render the preset pose every frame, never advance it.
  const renderFrozen = () => {
    drawGame(ctx, game);
    game.writeProbe();
    requestAnimationFrame(renderFrozen);
  };
  renderFrozen();
} else if (test) {
  game.beginTest(test);
  let last = performance.now();
  let frames = 0;
  const loop = (now) => {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    game.update(dt);
    drawGame(ctx, game);
    frames += 1;
    if (frames % 15 === 0) game.writeProbe();
    if (game.testDone || game.time > 240) {
      game.writeProbe();
      document.title = `TEST ${test.toUpperCase()} ${game.testDone ? 'DONE' : 'TIMEOUT'} state=${game.state}`;
      return;
    }
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
} else {
  let last = performance.now();
  const loop = (now) => {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    game.update(dt);
    drawGame(ctx, game);
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
}
