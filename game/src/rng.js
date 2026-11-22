// Seeded random numbers for The Midnight Vault.
// Every random draw in the game comes from a seeded generator, so a fixed
// seed always rebuilds the same level jitter, the same patrol timing and the
// same screenshot. No Math.random and no wall clock enter the simulation.

export function mulberry32(seed) {
  let state = seed >>> 0;
  return function nextRandom() {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

export function pickFrom(random, list) {
  return list[Math.floor(random() * list.length)];
}

export function rangeRandom(random, low, high) {
  return low + random() * (high - low);
}
