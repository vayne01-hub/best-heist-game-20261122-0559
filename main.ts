// The Midnight Vault — entry program for best-heist-game-20261122-0559.
//
// This program hands the game in: it copies this repository's game/ and
// screenshots/ into the output directory and writes output/dossier.json with
// buildDossier from the vendored make.fun library. It runs on Node 22 with
// the standard library only, no network, and writes the same bytes on every
// run: the game files are copied byte for byte and the dossier is built
// deterministically from them by the library itself.

import { cpSync, existsSync, mkdirSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

// ---------------------------------------------------------------------------
// Game metadata — what this entry is, for the record and for the log line
// the program prints. None of this text enters the dossier: the dossier is
// exactly what buildDossier writes from game/ and screenshots/, byte for
// byte, and this program never edits it by hand.
// ---------------------------------------------------------------------------
export const GAME_METADATA = {
  title: 'The Midnight Vault',
  competition: 'best-heist-game-20261122-0559',
  genre: 'Top-down stealth heist, vanilla canvas 2D, no external assets',
  rooms: ['ENTRY HALL', 'STORAGE', 'GRAND GALLERY', 'VAULT', 'OFFICE'],
  actors: {
    thief: 'Eight-way movement, sneak (Shift) that is slower and quieter, click-to-move, vault cracking on hold-E',
    guards: ['ROCCO patrols the Grand Gallery', 'MARA patrols the Vault and Office'],
    cameras: ['CAM 1 sweeps the Grand Gallery from the north wall', 'CAM 2 sweeps the Vault from the east wall'],
  },
  systems: {
    vision: 'Raycast vision cones clipped by walls; smoke blocks line of sight',
    alarm: 'Rises on guard sight, camera sight and loud footsteps near a guard; drains while hidden; 100 ends the run',
    tools: 'Two smoke pellets (Q), each costing 5 alarm to throw',
    loot: 'The Midnight Vault ($50,000, hold-to-crack) plus three small stashes; the vault plus the front-door exit wins the run',
  },
  determinism:
    'Fixed level layout, seeded random only, no wall clock in the simulation; ' +
    '?shot=cover|alert|loot|end renders one frozen deterministic frame for screenshots, ' +
    '?test=win|lose drives a scripted autopilot that proves the run can be won, lost and restarted',
  screenshots: {
    '01-cover.png': 'Thief crossing the Grand Gallery, Rocco suspicious with a yellow cone, CAM 1 sweeping, the vault glowing, alarm at 55%',
    '02-alert.png': 'Mara chasing, red cone, SPOTTED banner, alarm at 82%',
    '03-loot.png': 'Vault cracked open, gold burst, $63,000 banked, alarm at 30%',
    '04-end.png': 'GETAWAY CLEAN win screen, all four stashes, $69,000',
  },
};

export const DOSSIER_CAPS = {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  game_max_files: 993,
  game_max_bytes: 50331648,
  game_path_max_bytes: 1000,
};

// Pre-flight: count game/ entries and bytes so a too-big game fails here,
// loudly, instead of handing the scorer an entry it would refuse.
function countGameTree(dir) {
  let entries = 0;
  let bytes = 0;
  const walk = (current) => {
    for (const name of readdirSync(current)) {
      const path = join(current, name);
      const stats = statSync(path);
      entries += 1;
      if (stats.isDirectory()) walk(path);
      else bytes += stats.size;
    }
  };
  walk(dir);
  return { entries, bytes };
}

const here = fileURLToPath(new URL('.', import.meta.url));
const out = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';
const gameDir = join(here, 'game');
const shotsDir = join(here, 'screenshots');

const tree = countGameTree(gameDir);
if (tree.entries > DOSSIER_CAPS.game_max_files) {
  throw new Error(`game/ holds ${tree.entries} entries, over the ${DOSSIER_CAPS.game_max_files} cap`);
}
if (tree.bytes > DOSSIER_CAPS.game_max_bytes) {
  throw new Error(`game/ holds ${tree.bytes} bytes, over the ${DOSSIER_CAPS.game_max_bytes} cap`);
}

mkdirSync(out, { recursive: true });
cpSync(gameDir, join(out, 'game'), { recursive: true });
mkdirSync(join(out, 'screenshots'), { recursive: true });
if (existsSync(shotsDir)) cpSync(shotsDir, join(out, 'screenshots'), { recursive: true });

writeFileSync(join(out, 'dossier.json'), buildDossier(out, DOSSIER_CAPS));

console.log(
  `${GAME_METADATA.title} handed in: ${tree.entries} game entries, ${tree.bytes} bytes, ` +
    `${readdirSync(join(out, 'screenshots')).length} screenshots`,
);
