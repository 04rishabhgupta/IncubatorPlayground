import type { FloorDoor, FloorFixture, FloorWall, FloorWindow } from "./geometry";

/**
 * Pure geometry for drawing architectural details. Kept out of the React
 * components so the maths can be unit tested.
 */

/**
 * Default wall thickness by kind, in floor units. Exterior walls carry the
 * building, partitions are thinner, glass is a slim framed panel.
 */
export const WALL_THICKNESS = { exterior: 16, interior: 8, glass: 8 } as const;

export function wallThickness(wall: FloorWall) {
  return wall.thickness ?? WALL_THICKNESS[wall.kind];
}

type Orientation = "horizontal" | "vertical";

/** Every straight segment of a wall, including the closing one of a closed wall. */
function wallSegments(wall: FloorWall) {
  const pts = wall.closed ? [...wall.points, wall.points[0]] : wall.points;
  return pts.slice(1).map((p, i) => [pts[i], p] as const);
}

/**
 * The wall an opening sits on: an axis-aligned segment running the same way
 * as the opening and containing its midpoint. Doors and windows don't
 * reference walls in the data, so this is how an opening learns how deep a
 * cut to make. Returns undefined for openings that aren't on any wall.
 */
export function wallAt(
  walls: FloorWall[],
  { x, y, length, orientation }: { x: number; y: number; length: number; orientation: Orientation },
  tolerance = 1,
) {
  const horizontal = orientation === "horizontal";
  const mid = horizontal ? x + length / 2 : y + length / 2;
  const line = horizontal ? y : x;
  for (const wall of walls) {
    for (const [[x1, y1], [x2, y2]] of wallSegments(wall)) {
      const [a1, a2, l1, l2] = horizontal ? [x1, x2, y1, y2] : [y1, y2, x1, x2];
      if (Math.abs(l1 - l2) > tolerance || Math.abs(l1 - line) > tolerance) continue;
      if (mid >= Math.min(a1, a2) && mid <= Math.max(a1, a2)) return wall;
    }
  }
  return undefined;
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

/** Rectangle cut out of a wall for an opening, `depth` deep across the wall. */
export function openingRect(x: number, y: number, length: number, orientation: Orientation, depth: number) {
  return orientation === "horizontal"
    ? { x, y: y - depth / 2, width: length, height: depth }
    : { x: x - depth / 2, y, width: depth, height: length };
}

/** The two short lines closing the wall either side of an opening. */
export function jambLines(x: number, y: number, length: number, orientation: Orientation, depth: number) {
  const h = orientation === "horizontal";
  const half = depth / 2;
  return h
    ? [
        { x1: x, y1: y - half, x2: x, y2: y + half },
        { x1: x + length, y1: y - half, x2: x + length, y2: y + half },
      ]
    : [
        { x1: x - half, y1: y, x2: x + half, y2: y },
        { x1: x - half, y1: y + length, x2: x + half, y2: y + length },
      ];
}

/**
 * A door as plan symbols, in a wall `wallDepth` thick: the cut in the wall,
 * the leaf (swung open 90°) and the quarter-circle path its free edge sweeps.
 * As on architectural drawings, the leaf hinges on the face of the wall on
 * the side it opens towards. Double doors split the width into two mirrored
 * leaves; sliding doors get two overlapping panels inside the wall and plain
 * openings nothing but the cut.
 */
export function doorGeometry(door: FloorDoor, wallDepth: number = WALL_THICKNESS.interior) {
  const horizontal = door.orientation === "horizontal";
  const gap = openingRect(door.x, door.y, door.width, door.orientation, wallDepth);
  // The wall face on the swing side.
  const face = (horizontal ? door.y : door.x) + (door.swing * wallDepth) / 2;
  const leaves: Array<{ hinge: [number, number]; tip: [number, number]; arc: string }> = [];

  const leaf = (hingeAlong: number, leafLength: number, openDirAlong: 1 | -1) => {
    // The closed leaf runs along the face towards openDirAlong; opened, it
    // points perpendicular to the wall, towards the swing side.
    const at = (along: number, across: number): [number, number] =>
      horizontal ? [along, across] : [across, along];
    const hinge = at(hingeAlong, face);
    const closed = at(hingeAlong + openDirAlong * leafLength, face);
    const tip = at(hingeAlong, face + door.swing * leafLength);
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

  // Sliding: two panels, each a little over half the opening, offset either
  // side of the wall's centre line so they read as overlapping.
  const panels: Array<{ x: number; y: number; width: number; height: number }> = [];
  if (door.kind === "sliding") {
    const along = door.width * 0.55;
    const thick = Math.max(1.5, wallDepth * 0.18);
    const offset = wallDepth * 0.2;
    for (const [from, side] of [
      [start, -1],
      [end - along, 1],
    ] as const) {
      const across = (horizontal ? door.y : door.x) + side * offset - thick / 2;
      panels.push(
        horizontal
          ? { x: from, y: across, width: along, height: thick }
          : { x: across, y: from, width: thick, height: along },
      );
    }
  }

  return {
    gap,
    jambs: jambLines(door.x, door.y, door.width, door.orientation, wallDepth),
    leaves,
    panels,
    sliding: door.kind === "sliding",
  };
}

/**
 * A window in a wall `wallDepth` thick: the cut, the frame lines on both wall
 * faces and a double glazing line along the middle.
 */
export function windowGeometry(win: FloorWindow, wallDepth: number = WALL_THICKNESS.exterior) {
  const horizontal = win.orientation === "horizontal";
  const gap = openingRect(win.x, win.y, win.length, win.orientation, wallDepth);
  const line = (offset: number) =>
    horizontal
      ? { x1: win.x, y1: win.y + offset, x2: win.x + win.length, y2: win.y + offset }
      : { x1: win.x + offset, y1: win.y, x2: win.x + offset, y2: win.y + win.length };
  const glazing = Math.min(1.5, wallDepth / 6);
  return {
    gap,
    frame: [line(-wallDepth / 2), line(wallDepth / 2)],
    glass: [line(-glazing), line(glazing)],
    jambs: jambLines(win.x, win.y, win.length, win.orientation, wallDepth),
  };
}

/**
 * Detail level for the current zoom, from screen pixels per floor unit.
 * 0 = overview (furniture recedes, short labels), 1 = whole floor,
 * 2 = room close-up (fine furniture detail, full labels).
 */
export function detailLevel(pixelsPerUnit: number): 0 | 1 | 2 {
  if (pixelsPerUnit < 0.6) return 0;
  if (pixelsPerUnit < 1.6) return 1;
  return 2;
}
