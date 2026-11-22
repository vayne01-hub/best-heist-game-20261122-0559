// The mansion for The Midnight Vault: five rooms, doors, furniture, loot,
// guards' patrol routes and security cameras. Coordinates are canvas pixels
// on a 1280x720 stage with a 56px HUD bar on top. Walls and furniture are
// solid rectangles; doors are gaps left between wall segments.

export const STAGE_WIDTH = 1280;
export const STAGE_HEIGHT = 720;
export const HUD_HEIGHT = 56;

export function buildLevel() {
  const walls = [];
  const addWall = (x, y, w, h) => walls.push({ x, y, w, h });

  // Outer shell (play area y 64..712, x 8..1272).
  addWall(8, 64, 1256, 10); // north
  addWall(8, 702, 1256, 10); // south
  addWall(8, 64, 10, 648); // west
  addWall(1262, 64, 10, 648); // east

  // West divider (Entry Hall / Storage | Grand Gallery), doors north + south.
  addWall(352, 64, 10, 116);
  addWall(352, 240, 10, 280);
  addWall(352, 580, 10, 132);

  // East divider (Grand Gallery | Vault / Office), doors north + south.
  addWall(928, 64, 10, 136);
  addWall(928, 260, 10, 220);
  addWall(928, 540, 10, 172);

  // Horizontal divider west (Entry Hall | Storage), one door.
  addWall(8, 384, 142, 10);
  addWall(210, 384, 142, 10);

  // Horizontal divider east (Vault | Office), one door.
  addWall(928, 384, 132, 10);
  addWall(1120, 384, 152, 10);

  const rooms = [
    { name: 'ENTRY HALL', x: 18, y: 74, w: 334, h: 310, floor: '#232c3f', tile: '#273244' },
    { name: 'STORAGE', x: 18, y: 394, w: 334, h: 308, floor: '#2b2620', tile: '#332d25' },
    { name: 'GRAND GALLERY', x: 362, y: 74, w: 566, h: 628, floor: '#2a2438', tile: '#312a42' },
    { name: 'VAULT', x: 938, y: 74, w: 324, h: 310, floor: '#33261e', tile: '#3b2d23' },
    { name: 'OFFICE', x: 938, y: 394, w: 324, h: 308, floor: '#1f2d28', tile: '#253831' },
  ];

  const furniture = [
    { kind: 'table', label: 'HALL TABLE', x: 180, y: 150, w: 90, h: 44 },
    { kind: 'crate', label: 'CRATES', x: 120, y: 500, w: 70, h: 50 },
    { kind: 'crate', label: 'CRATES', x: 220, y: 600, w: 70, h: 50 },
    { kind: 'case', label: 'DISPLAY CASE', x: 520, y: 240, w: 90, h: 50 },
    { kind: 'case', label: 'DISPLAY CASE', x: 700, y: 480, w: 90, h: 50 },
    { kind: 'pedestal', label: 'STATUE', x: 600, y: 330, w: 46, h: 46 },
    { kind: 'crate', label: 'STRONG BOXES', x: 1000, y: 300, w: 60, h: 40 },
    { kind: 'desk', label: 'DESK', x: 1020, y: 480, w: 120, h: 56 },
    { kind: 'shelf', label: 'BOOKSHELF', x: 1150, y: 660, w: 110, h: 36 },
  ];

  const loot = [
    { id: 'vault', kind: 'vault', label: 'THE MIDNIGHT VAULT', x: 1180, y: 150, value: 50000, channelSeconds: 1.5, taken: false },
    { id: 'painting', kind: 'painting', label: 'GILDED PORTRAIT', x: 640, y: 96, value: 8000, channelSeconds: 0, taken: false },
    { id: 'vase', kind: 'vase', label: 'JADE VASE', x: 1080, y: 480, value: 5000, channelSeconds: 0, taken: false },
    { id: 'necklace', kind: 'necklace', label: 'PEARL NECKLACE', x: 250, y: 540, value: 6000, channelSeconds: 0, taken: false },
  ];

  const spawn = { x: 48, y: 300 };
  const exitZone = { x: 18, y: 280, w: 30, h: 40, label: 'FRONT DOOR — GETAWAY' };

  const guardRoutes = [
    {
      name: 'ROCCO',
      waypoints: [
        { x: 420, y: 200 },
        { x: 860, y: 200 },
        { x: 860, y: 600 },
        { x: 420, y: 600 },
      ],
      speed: 55,
    },
    {
      name: 'MARA',
      // Out-and-back loop through the Vault/Office door gap (x 1060..1120 at
      // y 384): a straight north-south patrol would walk into that wall.
      waypoints: [
        { x: 1000, y: 150 },
        { x: 1220, y: 150 },
        { x: 1220, y: 320 },
        { x: 1090, y: 360 },
        { x: 1160, y: 430 },
        { x: 1180, y: 560 },
        { x: 1000, y: 560 },
        { x: 1180, y: 560 },
        { x: 1160, y: 430 },
        { x: 1090, y: 360 },
        { x: 1220, y: 320 },
        { x: 1220, y: 150 },
      ],
      speed: 50,
    },
  ];

  const cameras = [
    { id: 'cam1', x: 640, y: 76, baseAngle: Math.PI / 2, sweep: 0.9, sweepSpeed: 0.45, range: 270, fov: 0.7 },
    { id: 'cam2', x: 1260, y: 200, baseAngle: Math.PI, sweep: 0.8, sweepSpeed: 0.6, range: 250, fov: 0.7 },
  ];

  return {
    walls,
    furniture,
    rooms,
    loot,
    spawn,
    exitZone,
    guardRoutes,
    cameras,
    solids: [...walls, ...furniture.map((f) => ({ x: f.x, y: f.y, w: f.w, h: f.h }))],
  };
}

export function roomAt(level, x, y) {
  for (const room of level.rooms) {
    if (x >= room.x && x <= room.x + room.w && y >= room.y && y <= room.y + room.h) return room;
  }
  return null;
}

// Push a circle out of every solid rectangle it overlaps.
export function resolveCircleCollision(circle, solids) {
  for (const rect of solids) {
    const nearestX = Math.max(rect.x, Math.min(circle.x, rect.x + rect.w));
    const nearestY = Math.max(rect.y, Math.min(circle.y, rect.y + rect.h));
    const dx = circle.x - nearestX;
    const dy = circle.y - nearestY;
    const distSq = dx * dx + dy * dy;
    if (distSq < circle.radius * circle.radius) {
      if (distSq === 0) {
        circle.x += circle.radius;
      } else {
        const dist = Math.sqrt(distSq);
        circle.x = nearestX + (dx / dist) * circle.radius;
        circle.y = nearestY + (dy / dist) * circle.radius;
      }
    }
  }
}
