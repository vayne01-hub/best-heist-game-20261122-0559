// All canvas drawing for The Midnight Vault.
// One job: turn the game state into a readable top-down scene where safe
// cover, danger and loot are obvious at a glance — warm floors, dark wood
// walls, gold loot, soft yellow guard cones that turn red on a chase, and a
// labelled HUD bar with the alarm, the loot and the timer.

import { STAGE_WIDTH, STAGE_HEIGHT, HUD_HEIGHT, roomAt } from './level.js';

const CONE_COLORS = {
  patrol: 'rgba(242, 201, 76, 0.30)',
  suspicious: 'rgba(242, 181, 68, 0.42)',
  search: 'rgba(242, 181, 68, 0.42)',
  chase: 'rgba(239, 83, 80, 0.48)',
  camera: 'rgba(120, 200, 255, 0.30)',
  cameraAlert: 'rgba(239, 83, 80, 0.48)',
};

export function drawCone(ctx, points, fill) {
  if (points.length < 3) return;
  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y);
  for (let i = 1; i < points.length; i += 1) ctx.lineTo(points[i].x, points[i].y);
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.18)';
  ctx.lineWidth = 1;
  ctx.stroke();
}

function drawFloor(ctx, level) {
  for (const room of level.rooms) {
    ctx.fillStyle = room.floor;
    ctx.fillRect(room.x, room.y, room.w, room.h);
    ctx.fillStyle = room.tile;
    const tile = 46;
    for (let x = room.x; x < room.x + room.w; x += tile) {
      for (let y = room.y; y < room.y + room.h; y += tile) {
        if (((x - room.x) / tile + (y - room.y) / tile) % 2 === 0) {
          ctx.fillRect(x, y, tile, tile);
        }
      }
    }
    ctx.strokeStyle = 'rgba(255,255,255,0.05)';
    ctx.lineWidth = 1;
    for (let x = room.x; x <= room.x + room.w; x += tile) {
      ctx.beginPath();
      ctx.moveTo(x, room.y);
      ctx.lineTo(x, room.y + room.h);
      ctx.stroke();
    }
    for (let y = room.y; y <= room.y + room.h; y += tile) {
      ctx.beginPath();
      ctx.moveTo(room.x, y);
      ctx.lineTo(room.x + room.w, y);
      ctx.stroke();
    }
    // Room label, small and tucked in a corner.
    ctx.fillStyle = 'rgba(255,255,255,0.34)';
    ctx.font = '600 13px Georgia, serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText(room.name, room.x + 12, room.y + 10);
  }
  // Gallery rug.
  ctx.fillStyle = 'rgba(120, 40, 40, 0.35)';
  ctx.beginPath();
  ctx.ellipse(640, 420, 150, 84, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = 'rgba(242, 201, 76, 0.35)';
  ctx.lineWidth = 3;
  ctx.stroke();
}

function drawWalls(ctx, level) {
  for (const wall of level.walls) {
    ctx.fillStyle = '#4a3423';
    ctx.fillRect(wall.x, wall.y, wall.w, wall.h);
    ctx.fillStyle = '#6b4c30';
    if (wall.w >= wall.h) ctx.fillRect(wall.x, wall.y, wall.w, 3);
    else ctx.fillRect(wall.x, wall.y, 3, wall.h);
  }
  // Door thresholds.
  ctx.fillStyle = '#8a6a45';
  const doors = [
    { x: 352, y: 180, w: 10, h: 60 },
    { x: 352, y: 520, w: 10, h: 60 },
    { x: 928, y: 200, w: 10, h: 60 },
    { x: 928, y: 480, w: 10, h: 60 },
    { x: 150, y: 384, w: 60, h: 10 },
    { x: 1060, y: 384, w: 60, h: 10 },
  ];
  for (const d of doors) ctx.fillRect(d.x, d.y, d.w, d.h);
}

function drawFurniture(ctx, level) {
  const colors = {
    table: '#5d4030',
    crate: '#6d4c2f',
    case: '#3d5a73',
    pedestal: '#7a7568',
    desk: '#4e3421',
    shelf: '#3e2723',
  };
  for (const f of level.furniture) {
    ctx.fillStyle = colors[f.kind] || '#555';
    ctx.fillRect(f.x, f.y, f.w, f.h);
    ctx.strokeStyle = 'rgba(255,255,255,0.22)';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(f.x + 1, f.y + 1, f.w - 2, f.h - 2);
    if (f.kind === 'case') {
      ctx.fillStyle = 'rgba(180, 220, 255, 0.25)';
      ctx.fillRect(f.x + 8, f.y + 8, f.w - 16, f.h - 16);
    }
    ctx.fillStyle = 'rgba(255,255,255,0.4)';
    ctx.font = '600 10px Georgia, serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(f.label, f.x + f.w / 2, f.y + f.h / 2);
  }
}

function drawLoot(ctx, level, time) {
  for (const item of level.loot) {
    if (item.taken) {
      if (item.kind === 'vault') {
        // The cracked vault stays on screen as an open, emptied safe.
        ctx.fillStyle = '#37474f';
        ctx.fillRect(item.x - 52, item.y - 40, 104, 80);
        ctx.strokeStyle = '#78909c';
        ctx.lineWidth = 3;
        ctx.strokeRect(item.x - 52, item.y - 40, 104, 80);
        ctx.fillStyle = '#0d0f16';
        ctx.fillRect(item.x - 40, item.y - 28, 80, 56);
        ctx.fillStyle = 'rgba(255,255,255,0.55)';
        ctx.font = '700 12px Georgia, serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        ctx.fillText('VAULT — CRACKED', item.x, item.y + 48);
      }
      continue;
    }
    const pulse = 0.5 + 0.5 * Math.sin(time * 3 + item.x);
    if (item.kind === 'vault') {
      const glow = ctx.createRadialGradient(item.x, item.y, 10, item.x, item.y, 110);
      glow.addColorStop(0, `rgba(255, 200, 60, ${0.35 + pulse * 0.2})`);
      glow.addColorStop(1, 'rgba(255, 200, 60, 0)');
      ctx.fillStyle = glow;
      ctx.fillRect(item.x - 110, item.y - 110, 220, 220);
      ctx.fillStyle = '#37474f';
      ctx.fillRect(item.x - 52, item.y - 40, 104, 80);
      ctx.strokeStyle = '#ffb300';
      ctx.lineWidth = 3;
      ctx.strokeRect(item.x - 52, item.y - 40, 104, 80);
      ctx.fillStyle = '#ffb300';
      ctx.beginPath();
      ctx.arc(item.x, item.y, 16, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#37474f';
      ctx.beginPath();
      ctx.arc(item.x, item.y, 8, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#ffe082';
      ctx.font = '700 13px Georgia, serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'bottom';
      ctx.fillText('$50,000', item.x, item.y - 48);
    } else if (item.kind === 'painting') {
      ctx.fillStyle = '#8d6e2f';
      ctx.fillRect(item.x - 34, item.y - 16, 68, 32);
      ctx.fillStyle = '#2e5d8a';
      ctx.fillRect(item.x - 28, item.y - 11, 56, 22);
      ctx.fillStyle = '#ffd54f';
      ctx.beginPath();
      ctx.arc(item.x, item.y, 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#ffe082';
      ctx.font = '700 12px Georgia, serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.fillText('$8,000', item.x, item.y + 22);
    } else if (item.kind === 'vase') {
      ctx.fillStyle = '#26a69a';
      ctx.beginPath();
      ctx.ellipse(item.x, item.y, 11, 15, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#ffe082';
      ctx.font = '700 12px Georgia, serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.fillText('$5,000', item.x, item.y + 20);
    } else {
      ctx.fillStyle = '#f8f8ff';
      for (let i = 0; i < 5; i += 1) {
        const a = (i / 5) * Math.PI * 2 + time;
        ctx.beginPath();
        ctx.arc(item.x + Math.cos(a) * 9, item.y + Math.sin(a) * 9, 3, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.fillStyle = '#ffe082';
      ctx.font = '700 12px Georgia, serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.fillText('$6,000', item.x, item.y + 20);
    }
    // Small floating marker so loot reads from across the room.
    ctx.fillStyle = `rgba(255, 213, 79, ${0.55 + pulse * 0.35})`;
    ctx.font = '700 11px Georgia, serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.fillText('LOOT', item.x, item.y - (item.kind === 'vault' ? 62 : 34));
  }
}

function drawExit(ctx, level, vaultTaken) {
  const zone = level.exitZone;
  ctx.fillStyle = vaultTaken ? 'rgba(87, 199, 133, 0.35)' : 'rgba(255,255,255,0.10)';
  ctx.fillRect(zone.x, zone.y, zone.w, zone.h);
  ctx.strokeStyle = vaultTaken ? '#57c785' : 'rgba(255,255,255,0.4)';
  ctx.lineWidth = 2;
  ctx.strokeRect(zone.x, zone.y, zone.w, zone.h);
  ctx.fillStyle = vaultTaken ? '#a5e8bf' : 'rgba(255,255,255,0.55)';
  ctx.font = '700 11px Georgia, serif';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText('EXIT', 52, zone.y + zone.h / 2 - 8);
  ctx.fillText(vaultTaken ? 'GO!' : 'GETAWAY', 52, zone.y + zone.h / 2 + 8);
}

function drawSmoke(ctx, smokes) {
  for (const smoke of smokes) {
    const gradient = ctx.createRadialGradient(smoke.x, smoke.y, 6, smoke.x, smoke.y, smoke.radius);
    gradient.addColorStop(0, 'rgba(200, 205, 215, 0.55)');
    gradient.addColorStop(1, 'rgba(200, 205, 215, 0.05)');
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(smoke.x, smoke.y, smoke.radius, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawGuard(ctx, guard) {
  drawCone(ctx, guard.cone, CONE_COLORS[guard.state] || CONE_COLORS.patrol);
  ctx.fillStyle = '#1f2a44';
  ctx.beginPath();
  ctx.arc(guard.x, guard.y, guard.radius, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#90a4c8';
  ctx.lineWidth = 2;
  ctx.stroke();
  // Cap brim + facing tick.
  ctx.fillStyle = '#90a4c8';
  ctx.beginPath();
  ctx.arc(guard.x + Math.cos(guard.angle) * 8, guard.y + Math.sin(guard.angle) * 8, 5, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#e8ecf4';
  ctx.font = '700 11px Georgia, serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'bottom';
  ctx.fillText(guard.name, guard.x, guard.y - guard.radius - 6);
  if (guard.state === 'chase' || guard.state === 'suspicious' || guard.state === 'search') {
    ctx.fillStyle = guard.state === 'chase' ? '#ef5350' : '#f2b544';
    ctx.font = '900 22px Georgia, serif';
    ctx.textBaseline = 'bottom';
    ctx.fillText(guard.state === 'chase' ? '!' : '?', guard.x, guard.y - guard.radius - 20);
  }
}

function drawCamera(ctx, camera) {
  drawCone(ctx, camera.cone, camera.alert ? CONE_COLORS.cameraAlert : CONE_COLORS.camera);
  ctx.fillStyle = '#263238';
  ctx.fillRect(camera.x - 12, camera.y - 8, 24, 16);
  ctx.fillStyle = camera.alert ? '#ef5350' : '#4fc3f7';
  ctx.beginPath();
  ctx.arc(camera.x, camera.y, 6, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.5)';
  ctx.font = '700 10px Georgia, serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.fillText('CAM', camera.x, camera.y + 12);
}

function drawThief(ctx, thief, time) {
  const crouch = thief.sneaking ? 0.78 : 1;
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.beginPath();
  ctx.ellipse(thief.x, thief.y + 10, 13, 5, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#12141c';
  ctx.beginPath();
  ctx.arc(thief.x, thief.y, thief.radius * crouch, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#e8ecf4';
  ctx.lineWidth = 2;
  ctx.stroke();
  // Striped shirt hint + mask band.
  ctx.strokeStyle = '#39415a';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(thief.x - 8, thief.y - 2);
  ctx.lineTo(thief.x + 8, thief.y - 2);
  ctx.moveTo(thief.x - 8, thief.y + 4);
  ctx.lineTo(thief.x + 8, thief.y + 4);
  ctx.stroke();
  ctx.fillStyle = '#e8ecf4';
  ctx.beginPath();
  ctx.arc(thief.x + Math.cos(thief.angle) * 7, thief.y + Math.sin(thief.angle) * 7, 3.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#e8ecf4';
  ctx.font = '700 11px Georgia, serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'bottom';
  ctx.fillText(thief.sneaking ? 'SNEAKING' : 'THIEF', thief.x, thief.y - thief.radius - 6);
  if (thief.channel) {
    const progress = thief.channelProgress / thief.channel.channelSeconds;
    ctx.strokeStyle = 'rgba(255,255,255,0.25)';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(thief.x, thief.y, 22, 0, Math.PI * 2);
    ctx.stroke();
    ctx.strokeStyle = '#ffb300';
    ctx.beginPath();
    ctx.arc(thief.x, thief.y, 22, -Math.PI / 2, -Math.PI / 2 + progress * Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = '#ffe082';
    ctx.font = '700 11px Georgia, serif';
    ctx.textBaseline = 'bottom';
    ctx.fillText('CRACKING…', thief.x, thief.y - 26);
  }
}

export function drawHud(ctx, game) {
  ctx.fillStyle = 'rgba(10, 12, 20, 0.92)';
  ctx.fillRect(0, 0, STAGE_WIDTH, HUD_HEIGHT);
  ctx.fillStyle = 'rgba(255,255,255,0.08)';
  ctx.fillRect(0, HUD_HEIGHT - 2, STAGE_WIDTH, 2);

  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  ctx.fillStyle = '#e8ecf4';
  ctx.font = '700 15px Georgia, serif';
  ctx.fillText('THE MIDNIGHT VAULT', 16, HUD_HEIGHT / 2 - 10);
  ctx.fillStyle = 'rgba(255,255,255,0.55)';
  ctx.font = '11px Georgia, serif';
  ctx.fillText('WASD / arrows move · SHIFT sneak · E grab · Q smoke · R restart', 16, HUD_HEIGHT / 2 + 12);

  // Alarm meter.
  const alarmX = 470;
  const alarmW = 260;
  ctx.fillStyle = '#e8ecf4';
  ctx.font = '700 13px Georgia, serif';
  ctx.fillText('ALARM', alarmX, 16);
  ctx.fillStyle = 'rgba(255,255,255,0.15)';
  ctx.fillRect(alarmX, 26, alarmW, 18);
  ctx.fillStyle = game.alarm.color;
  ctx.fillRect(alarmX, 26, alarmW * game.alarm.level, 18);
  ctx.strokeStyle = 'rgba(255,255,255,0.5)';
  ctx.lineWidth = 1.5;
  ctx.strokeRect(alarmX, 26, alarmW, 18);
  ctx.fillStyle = '#ffffff';
  ctx.font = '700 12px Georgia, serif';
  ctx.textAlign = 'center';
  ctx.fillText(`${Math.round(game.alarm.value)}%`, alarmX + alarmW / 2, 35);
  ctx.textAlign = 'left';

  // Loot.
  const lootX = 770;
  ctx.fillStyle = '#ffe082';
  ctx.font = '700 14px Georgia, serif';
  ctx.fillText(`LOOT $${game.lootValue.toLocaleString('en-US')} / $69,000`, lootX, 16);
  ctx.fillStyle = 'rgba(255,255,255,0.55)';
  ctx.font = '11px Georgia, serif';
  ctx.fillText(`${game.lootTaken} of 4 stashes`, lootX, 36);

  // Timer + smoke.
  const rightX = 1080;
  ctx.fillStyle = '#e8ecf4';
  ctx.font = '700 14px Georgia, serif';
  ctx.fillText(`TIME ${game.timerText}`, rightX, 16);
  ctx.fillStyle = 'rgba(255,255,255,0.55)';
  ctx.font = '11px Georgia, serif';
  ctx.fillText(`SMOKE ×${game.thief.smokeCharges}  ·  ${game.roomName}`, rightX, 36);
}

function drawBanner(ctx, text, subtext, color) {
  ctx.fillStyle = 'rgba(8, 10, 18, 0.72)';
  ctx.fillRect(0, 250, STAGE_WIDTH, 150);
  ctx.fillStyle = color;
  ctx.font = '900 54px Georgia, serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, STAGE_WIDTH / 2, 310);
  ctx.fillStyle = '#e8ecf4';
  ctx.font = '16px Georgia, serif';
  ctx.fillText(subtext, STAGE_WIDTH / 2, 356);
}

export function drawGame(ctx, game) {
  const level = game.level;
  const time = game.time;
  ctx.clearRect(0, 0, STAGE_WIDTH, STAGE_HEIGHT);
  ctx.fillStyle = '#0d0f16';
  ctx.fillRect(0, 0, STAGE_WIDTH, STAGE_HEIGHT);

  drawFloor(ctx, level);
  drawExit(ctx, level, game.vaultTaken);
  drawLoot(ctx, level, time);
  drawWalls(ctx, level);
  drawFurniture(ctx, level);
  drawSmoke(ctx, game.smokes);
  for (const camera of game.cameras) drawCamera(ctx, camera);
  for (const guard of game.guards) drawGuard(ctx, guard);
  drawThief(ctx, game.thief, time);
  for (const p of game.particles.particles) {
    ctx.globalAlpha = Math.max(0, p.life / p.maxLife);
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  for (const f of game.particles.floaters) {
    ctx.globalAlpha = Math.max(0, f.life / f.maxLife);
    ctx.fillStyle = '#ffe082';
    ctx.font = '700 15px Georgia, serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(f.text, f.x, f.y);
  }
  ctx.globalAlpha = 1;

  // Interaction prompt.
  const loot = game.thief.nearestLoot(level);
  if (loot && game.state === 'playing' && !game.thief.channel) {
    ctx.fillStyle = 'rgba(10, 12, 20, 0.85)';
    const label = loot.kind === 'vault' ? 'Hold E — CRACK THE VAULT' : `Press E — TAKE ${loot.label}`;
    ctx.font = '700 13px Georgia, serif';
    const width = ctx.measureText(label).width + 24;
    ctx.fillRect(game.thief.x - width / 2, game.thief.y - 58, width, 24);
    ctx.fillStyle = '#ffe082';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, game.thief.x, game.thief.y - 46);
  }

  // Spotted flash.
  if (game.spottedFlash > 0) {
    ctx.fillStyle = `rgba(239, 83, 80, ${Math.min(0.25, game.spottedFlash * 0.2)})`;
    ctx.fillRect(0, HUD_HEIGHT, STAGE_WIDTH, STAGE_HEIGHT - HUD_HEIGHT);
    ctx.fillStyle = '#ff8a80';
    ctx.font = '900 30px Georgia, serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.fillText('SPOTTED!', STAGE_WIDTH / 2, STAGE_HEIGHT - 12);
  }

  drawHud(ctx, game);

  if (game.state === 'title') {
    ctx.fillStyle = 'rgba(8, 10, 18, 0.78)';
    ctx.fillRect(0, HUD_HEIGHT, STAGE_WIDTH, STAGE_HEIGHT - HUD_HEIGHT);
    ctx.fillStyle = '#ffe082';
    ctx.font = '900 52px Georgia, serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('THE MIDNIGHT VAULT', STAGE_WIDTH / 2, 240);
    ctx.fillStyle = '#e8ecf4';
    ctx.font = '18px Georgia, serif';
    ctx.fillText('One thief. Five rooms. Two guards, two cameras, one vault.', STAGE_WIDTH / 2, 300);
    ctx.fillText('Crack the vault, grab what you can, and slip out the front door.', STAGE_WIDTH / 2, 330);
    ctx.fillStyle = 'rgba(255,255,255,0.65)';
    ctx.font = '15px Georgia, serif';
    ctx.fillText('WASD / arrows — move      SHIFT — sneak (slow, quiet)      E — grab loot', STAGE_WIDTH / 2, 400);
    ctx.fillText('Q — smoke pellet (2)      Click — walk there      R — restart', STAGE_WIDTH / 2, 428);
    ctx.fillStyle = '#ffe082';
    ctx.font = '700 20px Georgia, serif';
    ctx.fillText('Press ENTER to start the heist', STAGE_WIDTH / 2, 500);
  } else if (game.state === 'won') {
    drawBanner(ctx, 'GETAWAY CLEAN', `Loot $${game.lootValue.toLocaleString('en-US')} in ${game.timerText} — press R to run it again`, '#57c785');
  } else if (game.state === 'lost') {
    drawBanner(ctx, game.loseReason === 'caught' ? 'CAUGHT!' : 'ALARM TRIPPED!', 'The mansion wakes up. Press R to try again.', '#ef5350');
  }
}
