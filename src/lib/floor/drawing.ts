import type { FloorDoor, FloorFixture, FloorWall, FloorWindow } from "./geometry";

/**
 * Pure geometry for drawing architectural details. Kept out of the React
 * components so the maths can be unit tested.
 */

export const WALL_THICKNESS = { exterior: 8, interior: 4, glass: 3 } as const;

export function wallThickness(wall: FloorWall) {
  return wall.thickness ?? WALL_THICKNESS[wall.kind];
}

/**
 * Rotation for a fixture around its own centre. Rotating by 90/270 swaps the
 * visual width and height, so the symbol is drawn with swapped dimensions
 * and rotated into place — callers keep thinking in on-plan boxes.
 */
export function fixturePlacement(f: FloorFixture) {
  const cx = f.x + f.width / 2;
  const cy = f.y + f.height / 2;
  const quarter = f.rotation === 90 || f.rotation === 270;
  const w = quarter ? f.height : f.width;
  const h = quarter ? f.width : f.height;
  return {
    x: cx - w / 2,
    y: cy - h / 2,
    width: w,
    height: h,
    transform: f.rotation ? `rotate(${f.rotation} ${cx} ${cy})` : undefined,
  };
}

/** Rectangle that "cuts" the opening out of a wall (painted in the floor colour). */
function openingRect(x: number, y: number, length: number, horizontal: boolean, depth: number) {
  return horizontal
    ? { x, y: y - depth / 2, width: length, height: depth }
    : { x: x - depth / 2, y, width: depth, height: length };
}

/**
 * A door as plan symbols: the gap in the wall, the leaf (a line from the
 * hinge, swung open 90°) and the quarter-circle path the leaf sweeps.
 * Double doors split the width into two mirrored leaves; sliding doors and
 * plain openings have no arc.
 */
export function doorGeometry(door: FloorDoor, wallDepth = 12) {
  const horizontal = door.orientation === "horizontal";
  const gap = openingRect(door.x, door.y, door.width, horizontal, wallDepth);
  const leaves: Array<{ hinge: [number, number]; tip: [number, number]; arc: string }> = [];

  const leaf = (hingeAlong: number, leafLength: number, openDirAlong: 1 | -1) => {
    // Hinge point on the wall line, the closed leaf runs along the wall towards
    // openDirAlong; opened, it points perpendicular to the wall (towards swing).
    const hinge: [number, number] = horizontal ? [hingeAlong, door.y] : [door.x, hingeAlong];
    const closed: [number, number] = horizontal
      ? [hingeAlong + openDirAlong * leafLength, door.y]
      : [door.x, hingeAlong + openDirAlong * leafLength];
    const tip: [number, number] = horizontal
      ? [hingeAlong, door.y + door.swing * leafLength]
      : [door.x + door.swing * leafLength, hingeAlong];
    // Sweep flag picks the arc that bulges away from the wall.
    const cross = horizontal ? openDirAlong * door.swing : -openDirAlong * door.swing;
    const sweep = cross > 0 ? 1 : 0;
    const arc = `M ${closed[0]} ${closed[1]} A ${leafLength} ${leafLength} 0 0 ${sweep} ${tip[0]} ${tip[1]}`;
    leaves.push({ hinge, tip, arc });
  };

  const start = horizontal ? door.x : door.y;
  const end = start + door.width;
  if (door.kind === "single") {
    if (door.hinge === "start") leaf(start, door.width, 1);
    else leaf(end, door.width, -1);
  } else if (door.kind === "double") {
    leaf(start, door.width / 2, 1);
    leaf(end, door.width / 2, -1);
  }
  return { gap, leaves, sliding: door.kind === "sliding" };
}

/** A window: the opening in the wall plus the two glazing lines inside it. */
export function windowGeometry(win: FloorWindow, wallDepth = 10) {
  const horizontal = win.orientation === "horizontal";
  const gap = openingRect(win.x, win.y, win.length, horizontal, wallDepth);
  const offset = wallDepth / 4;
  const lines = horizontal
    ? [
        { x1: win.x, y1: win.y - offset, x2: win.x + win.length, y2: win.y - offset },
        { x1: win.x, y1: win.y + offset, x2: win.x + win.length, y2: win.y + offset },
      ]
    : [
        { x1: win.x - offset, y1: win.y, x2: win.x - offset, y2: win.y + win.length },
        { x1: win.x + offset, y1: win.y, x2: win.x + offset, y2: win.y + win.length },
      ];
  return { gap, lines };
}
