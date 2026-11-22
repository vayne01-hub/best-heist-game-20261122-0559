// Vision math for The Midnight Vault: raycast vision cones and line of sight.
// A cone is a fan of rays clipped by the level's solid rectangles, so a cone
// is cut short by a wall exactly the way a guard's sight would be. Smoke
// clouds block sight too: a segment that crosses a smoke disc is blind.

export function segmentHitsRect(ax, ay, bx, by, rect) {
  const dx = bx - ax;
  const dy = by - ay;
  let tMin = 0;
  let tMax = 1;
  if (dx === 0) {
    if (ax < rect.x || ax > rect.x + rect.w) return false;
  } else {
    let t1 = (rect.x - ax) / dx;
    let t2 = (rect.x + rect.w - ax) / dx;
    if (t1 > t2) {
      const tmp = t1;
      t1 = t2;
      t2 = tmp;
    }
    tMin = Math.max(tMin, t1);
    tMax = Math.min(tMax, t2);
    if (tMin > tMax) return false;
  }
  if (dy === 0) {
    if (ay < rect.y || ay > rect.y + rect.h) return false;
  } else {
    let t1 = (rect.y - ay) / dy;
    let t2 = (rect.y + rect.h - ay) / dy;
    if (t1 > t2) {
      const tmp = t1;
      t1 = t2;
      t2 = tmp;
    }
    tMin = Math.max(tMin, t1);
    tMax = Math.min(tMax, t2);
    if (tMin > tMax) return false;
  }
  return true;
}

export function rayDistance(ox, oy, dx, dy, maxDistance, solids) {
  let best = maxDistance;
  for (const rect of solids) {
    const hit = rayRectDistance(ox, oy, dx, dy, rect);
    if (hit !== null && hit < best) best = hit;
  }
  return best;
}

function rayRectDistance(ox, oy, dx, dy, rect) {
  let tMin = 0;
  let tMax = Infinity;
  if (dx === 0) {
    if (ox < rect.x || ox > rect.x + rect.w) return null;
  } else {
    let t1 = (rect.x - ox) / dx;
    let t2 = (rect.x + rect.w - ox) / dx;
    if (t1 > t2) {
      const tmp = t1;
      t1 = t2;
      t2 = tmp;
    }
    tMin = Math.max(tMin, t1);
    tMax = Math.min(tMax, t2);
    if (tMin > tMax) return null;
  }
  if (dy === 0) {
    if (oy < rect.y || oy > rect.y + rect.h) return null;
  } else {
    let t1 = (rect.y - oy) / dy;
    let t2 = (rect.y + rect.h - oy) / dy;
    if (t1 > t2) {
      const tmp = t1;
      t1 = t2;
      t2 = tmp;
    }
    tMin = Math.max(tMin, t1);
    tMax = Math.min(tMax, t2);
    if (tMin > tMax) return null;
  }
  return tMin;
}

// Cast a vision cone as a polygon: the observer plus one point per ray.
export function castVisionCone(ox, oy, angle, fieldOfView, range, solids, rayCount = 44) {
  const points = [{ x: ox, y: oy }];
  for (let i = 0; i <= rayCount; i += 1) {
    const rayAngle = angle - fieldOfView / 2 + (fieldOfView * i) / rayCount;
    const dx = Math.cos(rayAngle);
    const dy = Math.sin(rayAngle);
    const distance = rayDistance(ox, oy, dx, dy, range, solids);
    points.push({ x: ox + dx * distance, y: oy + dy * distance });
  }
  return points;
}

export function segmentCrossesDisc(ax, ay, bx, by, cx, cy, radius) {
  const dx = bx - ax;
  const dy = by - ay;
  const lengthSquared = dx * dx + dy * dy;
  if (lengthSquared === 0) {
    const ddx = ax - cx;
    const ddy = ay - cy;
    return ddx * ddx + ddy * ddy <= radius * radius;
  }
  let t = ((cx - ax) * dx + (cy - ay) * dy) / lengthSquared;
  t = Math.max(0, Math.min(1, t));
  const px = ax + dx * t - cx;
  const py = ay + dy * t - cy;
  return px * px + py * py <= radius * radius;
}

export function hasLineOfSight(ax, ay, bx, by, solids, smokes) {
  for (const rect of solids) {
    if (segmentHitsRect(ax, ay, bx, by, rect)) return false;
  }
  for (const smoke of smokes) {
    if (segmentCrossesDisc(ax, ay, bx, by, smoke.x, smoke.y, smoke.radius)) return false;
  }
  return true;
}

export function angleDifference(a, b) {
  let diff = (a - b) % (Math.PI * 2);
  if (diff > Math.PI) diff -= Math.PI * 2;
  if (diff < -Math.PI) diff += Math.PI * 2;
  return diff;
}
